from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pymongo import ReturnDocument

from app import slack_bot, team_memory
from app.database import avatar_exchanges_col, checkpoints_col, members_col, tasks_col
from app.models import PresenceStatus
from app.ollama_client import parse_checkin, run_avatar_exchange
from app.ws_manager import manager

router = APIRouter(prefix="/api/members", tags=["members"])


def _oid(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(400, "Invalid id")


class MemorySuggestion(BaseModel):
    title: str
    solution: str
    solved_by: str
    similarity: float


class MemberOut(BaseModel):
    id: str
    name: str
    role: str
    status: str
    in_zoom_call: bool
    blocked_reason: Optional[str]
    current_task: Optional[str] = None
    progress_done: int = 0
    progress_total: int = 0
    # New — see models.Task for why these exist now.
    last_update_note: Optional[str] = None
    last_checkin_at: Optional[datetime] = None
    memory_suggestion: Optional[MemorySuggestion] = None


class StatusUpdate(BaseModel):
    status: PresenceStatus
    blocked_reason: Optional[str] = None


class ZoomToggle(BaseModel):
    in_zoom_call: bool


class ReachRequest(BaseModel):
    requester_id: str
    reason: str


class CheckinRequest(BaseModel):
    message: str


class CheckinResponse(BaseModel):
    ack: str
    updated_checkpoints: List[str]


async def _member_to_out(m: dict) -> MemberOut:
    member_id = str(m["_id"])
    task = await tasks_col.find_one({"assignee_id": member_id}, sort=[("created_at", -1)])

    done = total = 0
    title = None
    last_update_note = None
    last_checkin_at = None
    if task:
        title = task["title"]
        last_update_note = task.get("last_update_note")
        last_checkin_at = task.get("last_checkin_at")
        checkpoints = await checkpoints_col.find({"task_id": str(task["_id"])}).to_list(None)
        total = len(checkpoints)
        done = sum(1 for c in checkpoints if c.get("done"))

    suggestion = None
    if m.get("status") == PresenceStatus.blocked.value and m.get("blocked_reason"):
        # Recomputed here (not just on the status-update response) so it survives
        # the list refetch that every websocket broadcast triggers on clients.
        hit = team_memory.search(m["blocked_reason"])
        if hit:
            suggestion = MemorySuggestion(**hit)

    return MemberOut(
        id=member_id, name=m["name"], role=m["role"], status=m["status"],
        in_zoom_call=m.get("in_zoom_call", False), blocked_reason=m.get("blocked_reason"),
        current_task=title, progress_done=done, progress_total=total,
        last_update_note=last_update_note, last_checkin_at=last_checkin_at,
        memory_suggestion=suggestion,
    )


@router.get("", response_model=List[MemberOut])
async def list_members():
    members = await members_col.find().to_list(None)
    return [await _member_to_out(m) for m in members]


@router.post("/{member_id}/status", response_model=MemberOut)
async def update_status(member_id: str, body: StatusUpdate):
    blocked_reason = body.blocked_reason if body.status == PresenceStatus.blocked else None
    result = await members_col.find_one_and_update(
        {"_id": _oid(member_id)},
        {"$set": {
            "status": body.status.value,
            "blocked_reason": blocked_reason,
            "updated_at": datetime.utcnow(),
        }},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(404, "Member not found")

    out = await _member_to_out(result)  # already includes memory_suggestion when blocked

    slack_line = f"{out.name} is now {out.status}"
    if out.blocked_reason:
        slack_line += f" — stuck on: {out.blocked_reason}"
    slack_bot.post_message(slack_line)

    await manager.broadcast("member_updated", out.dict())
    return out


@router.post("/{member_id}/checkin", response_model=CheckinResponse)
async def checkin(member_id: str, body: CheckinRequest):
    """The lightweight, non-intrusive check-in loop: the member says what they're
    doing in plain language, Ollama maps it onto checkpoint completion, and the
    raw sentence itself is now kept on the task so the lead can see it too."""
    _oid(member_id)  # validate format up front
    task = await tasks_col.find_one({"assignee_id": member_id}, sort=[("created_at", -1)])
    if not task:
        return CheckinResponse(ack="No active task to update yet.", updated_checkpoints=[])

    checkpoints = await checkpoints_col.find({"task_id": str(task["_id"])}).sort("order").to_list(None)
    result = await parse_checkin([c["title"] for c in checkpoints], body.message)

    updated_ids: List[str] = []
    for idx in result["completed_indices"]:
        if 0 <= idx < len(checkpoints) and not checkpoints[idx].get("done"):
            cp_id = checkpoints[idx]["_id"]
            await checkpoints_col.update_one({"_id": cp_id}, {"$set": {"done": True}})
            updated_ids.append(str(cp_id))

    await tasks_col.update_one(
        {"_id": task["_id"]},
        {"$set": {"last_update_note": body.message, "last_checkin_at": datetime.utcnow()}},
    )

    for cid in updated_ids:
        cp = await checkpoints_col.find_one({"_id": ObjectId(cid)})
        await manager.broadcast(
            "checkpoint_updated",
            {"task_id": str(task["_id"]), "id": cid, "title": cp["title"], "order": cp["order"], "done": cp["done"]},
        )

    # Also re-broadcast the member so the lead's card picks up the new
    # last_update_note/last_checkin_at immediately, even on a check-in that
    # completes zero checkpoints (e.g. "still working on it, no change yet").
    member = await members_col.find_one({"_id": ObjectId(member_id)})
    if member:
        await manager.broadcast("member_updated", (await _member_to_out(member)).dict())

    return CheckinResponse(ack=result["ack"], updated_checkpoints=updated_ids)


@router.post("/{member_id}/zoom", response_model=MemberOut)
async def toggle_zoom(member_id: str, body: ZoomToggle):
    """Simulated Zoom presence. No real Zoom SDK app is registered yet, so the lead
    or a demo script flips this flag directly to stand in for a real 'in a call' signal."""
    result = await members_col.find_one_and_update(
        {"_id": _oid(member_id)},
        {"$set": {"in_zoom_call": body.in_zoom_call}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(404, "Member not found")
    out = await _member_to_out(result)
    await manager.broadcast("member_updated", out.dict())
    return out


@router.post("/{member_id}/reach")
async def reach_member(member_id: str, body: ReachRequest):
    """Requester's avatar tries to reach this member's avatar. If the member is busy
    (focused, away, or in a simulated Zoom call), the two avatars have a short exchange
    instead of interrupting the person directly."""
    target = await members_col.find_one({"_id": _oid(member_id)})
    requester = await members_col.find_one({"_id": _oid(body.requester_id)})
    if not target or not requester:
        raise HTTPException(404, "Member not found")

    task = await tasks_col.find_one({"assignee_id": member_id}, sort=[("created_at", -1)])
    task_title = task["title"] if task else "no active task"

    if not target.get("in_zoom_call") and target["status"] == PresenceStatus.available.value:
        # Not busy, no need for the avatar-to-avatar dance.
        result = {"direct": True, "message": f"{target['name']} is available, reaching out directly."}
        await manager.broadcast("reach_result", {"target_id": member_id, **result})
        return result

    slack_bot.post_message(
        f"{requester['name']}'s avatar is reaching out to {target['name']}'s avatar ({body.reason})"
    )
    transcript = await run_avatar_exchange(
        requester_name=requester["name"],
        target_name=target["name"],
        target_status="in a Zoom call" if target.get("in_zoom_call") else target["status"],
        target_task_title=task_title,
        reason=body.reason,
    )
    await avatar_exchanges_col.insert_one({
        "requester_id": str(requester["_id"]),
        "target_id": str(target["_id"]),
        "transcript": transcript,
        "created_at": datetime.utcnow(),
    })

    result = {"direct": False, "transcript": transcript}
    await manager.broadcast("reach_result", {"target_id": member_id, **result})
    return result