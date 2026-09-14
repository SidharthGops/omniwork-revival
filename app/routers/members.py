from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app import slack_bot, team_memory
from app.database import get_session
from app.models import AvatarExchange, Checkpoint, Member, PresenceStatus, Task
from app.ollama_client import parse_checkin, run_avatar_exchange
from app.ws_manager import manager

router = APIRouter(prefix="/api/members", tags=["members"])


class MemorySuggestion(BaseModel):
    title: str
    solution: str
    solved_by: str
    similarity: float


class MemberOut(BaseModel):
    id: int
    name: str
    role: str
    status: str
    in_zoom_call: bool
    blocked_reason: Optional[str]
    current_task: Optional[str] = None
    progress_done: int = 0
    progress_total: int = 0
    memory_suggestion: Optional[MemorySuggestion] = None


class StatusUpdate(BaseModel):
    status: PresenceStatus
    blocked_reason: Optional[str] = None


class ZoomToggle(BaseModel):
    in_zoom_call: bool


class ReachRequest(BaseModel):
    requester_id: int
    reason: str


class CheckinRequest(BaseModel):
    message: str


class CheckinResponse(BaseModel):
    ack: str
    updated_checkpoints: List[int]


def _member_to_out(session: Session, m: Member) -> MemberOut:
    task = session.exec(
        select(Task).where(Task.assignee_id == m.id).order_by(Task.created_at.desc())
    ).first()
    done = total = 0
    title = None
    if task:
        title = task.title
        checkpoints = session.exec(select(Checkpoint).where(Checkpoint.task_id == task.id)).all()
        total = len(checkpoints)
        done = sum(1 for c in checkpoints if c.done)

    suggestion = None
    if m.status == PresenceStatus.blocked and m.blocked_reason:
        # Recomputed here (not just on the status-update response) so it survives
        # the list refetch that every websocket broadcast triggers on clients.
        hit = team_memory.search(m.blocked_reason)
        if hit:
            suggestion = MemorySuggestion(**hit)

    return MemberOut(
        id=m.id, name=m.name, role=m.role, status=m.status.value,
        in_zoom_call=m.in_zoom_call, blocked_reason=m.blocked_reason,
        current_task=title, progress_done=done, progress_total=total,
        memory_suggestion=suggestion,
    )


@router.get("", response_model=List[MemberOut])
def list_members(session: Session = Depends(get_session)):
    members = session.exec(select(Member)).all()
    return [_member_to_out(session, m) for m in members]


@router.post("/{member_id}/status", response_model=MemberOut)
async def update_status(member_id: int, body: StatusUpdate, session: Session = Depends(get_session)):
    member = session.get(Member, member_id)
    if not member:
        raise HTTPException(404, "Member not found")
    member.status = body.status
    member.blocked_reason = body.blocked_reason if body.status == PresenceStatus.blocked else None
    member.updated_at = datetime.utcnow()
    session.add(member)
    session.commit()
    session.refresh(member)
    out = _member_to_out(session, member)  # already includes memory_suggestion when blocked

    slack_line = f"{member.name} is now {member.status.value}"
    if member.blocked_reason:
        slack_line += f" — stuck on: {member.blocked_reason}"
    slack_bot.post_message(slack_line)

    await manager.broadcast("member_updated", out.dict())
    return out


@router.post("/{member_id}/checkin", response_model=CheckinResponse)
async def checkin(member_id: int, body: CheckinRequest, session: Session = Depends(get_session)):
    """The lightweight, non-intrusive check-in loop: the member says what they're
    doing in plain language, Ollama maps it onto checkpoint completion."""
    member = session.get(Member, member_id)
    if not member:
        raise HTTPException(404, "Member not found")

    task = session.exec(
        select(Task).where(Task.assignee_id == member_id).order_by(Task.created_at.desc())
    ).first()
    if not task:
        return CheckinResponse(ack="No active task to update yet.", updated_checkpoints=[])

    checkpoints = session.exec(
        select(Checkpoint).where(Checkpoint.task_id == task.id).order_by(Checkpoint.order)
    ).all()
    result = await parse_checkin([c.title for c in checkpoints], body.message)

    updated_ids = []
    for idx in result["completed_indices"]:
        if 0 <= idx < len(checkpoints) and not checkpoints[idx].done:
            checkpoints[idx].done = True
            session.add(checkpoints[idx])
            updated_ids.append(checkpoints[idx].id)
    session.commit()

    for cid in updated_ids:
        cp = session.get(Checkpoint, cid)
        await manager.broadcast(
            "checkpoint_updated",
            {"task_id": task.id, "id": cp.id, "title": cp.title, "order": cp.order, "done": cp.done},
        )

    return CheckinResponse(ack=result["ack"], updated_checkpoints=updated_ids)


@router.post("/{member_id}/zoom", response_model=MemberOut)
async def toggle_zoom(member_id: int, body: ZoomToggle, session: Session = Depends(get_session)):
    """Simulated Zoom presence. No real Zoom SDK app is registered yet, so the lead
    or a demo script flips this flag directly to stand in for a real 'in a call' signal."""
    member = session.get(Member, member_id)
    if not member:
        raise HTTPException(404, "Member not found")
    member.in_zoom_call = body.in_zoom_call
    session.add(member)
    session.commit()
    session.refresh(member)
    out = _member_to_out(session, member)
    await manager.broadcast("member_updated", out.dict())
    return out


@router.post("/{member_id}/reach")
async def reach_member(member_id: int, body: ReachRequest, session: Session = Depends(get_session)):
    """Requester's avatar tries to reach this member's avatar. If the member is busy
    (focused, away, or in a simulated Zoom call), the two avatars have a short exchange
    instead of interrupting the person directly."""
    target = session.get(Member, member_id)
    requester = session.get(Member, body.requester_id)
    if not target or not requester:
        raise HTTPException(404, "Member not found")

    task = session.exec(
        select(Task).where(Task.assignee_id == target.id).order_by(Task.created_at.desc())
    ).first()
    task_title = task.title if task else "no active task"

    if not target.in_zoom_call and target.status == PresenceStatus.available:
        # Not busy, no need for the avatar-to-avatar dance.
        result = {"direct": True, "message": f"{target.name} is available, reaching out directly."}
        await manager.broadcast("reach_result", {"target_id": target.id, **result})
        return result

    slack_bot.post_message(f"{requester.name}'s avatar is reaching out to {target.name}'s avatar ({body.reason})")
    transcript = await run_avatar_exchange(
        requester_name=requester.name,
        target_name=target.name,
        target_status="in a Zoom call" if target.in_zoom_call else target.status.value,
        target_task_title=task_title,
        reason=body.reason,
    )
    exchange = AvatarExchange(requester_id=requester.id, target_id=target.id, transcript=transcript)
    session.add(exchange)
    session.commit()
    session.refresh(exchange)

    result = {"direct": False, "transcript": transcript}
    await manager.broadcast("reach_result", {"target_id": target.id, **result})
    return result
