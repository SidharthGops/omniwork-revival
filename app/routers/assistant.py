from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import members_col
from app.ollama_client import route_ping
from app.routers.members import perform_reach

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


class PingRequest(BaseModel):
    requester_id: str
    message: str


@router.post("/ping")
async def assistant_ping(body: PingRequest):
    """Backs the Dashboard's AI-assistant chat panel: the lead types something like
    "check on priya" or "ping whoever's stuck" instead of clicking a specific
    person's "Reach via AI avatar" button. route_ping() (in ollama_client.py) asks
    your local Ollama model to pick the target from the current team roster +
    statuses; the actual reach-out then reuses the exact same perform_reach()
    logic as the per-member button, so behavior (busy check, transcript,
    broadcast) is identical either way — this is a natural-language front end
    over existing plumbing, not a second AI feature or a second Ollama call site.
    """
    try:
        requester_oid = ObjectId(body.requester_id)
    except (InvalidId, TypeError):
        raise HTTPException(400, "Invalid requester id")
    requester = await members_col.find_one({"_id": requester_oid})
    if not requester:
        raise HTTPException(404, "Requester not found")

    members = await members_col.find().to_list(None)
    if not members:
        return {"error": "No team members to ping yet."}

    roster_summary = [
        {"name": m["name"], "status": m["status"], "blocked_reason": m.get("blocked_reason")}
        for m in members
    ]
    routed = await route_ping(body.message, roster_summary)

    if not routed.get("reach"):
        # A greeting, small talk, or a general question — route_ping() decided
        # this isn't actually a request to reach anyone, so just reply instead
        # of firing an avatar exchange at a random/first teammate.
        return {"info": routed.get("text") or "Got it."}

    target_name = (routed.get("target_name") or "").strip().lower()
    reason = routed.get("text") or body.message

    target = next((m for m in members if m["name"].strip().lower() == target_name), None)
    if not target and target_name:
        # The model doesn't always echo the name back with identical
        # casing/whitespace — fall back to a loose substring match.
        target = next((m for m in members if target_name in m["name"].lower()), None)
    if not target:
        return {"error": f"Couldn't figure out who you meant from: \"{body.message}\""}

    result = await perform_reach(target, requester, reason)
    result["target_name"] = target["name"]
    return result
