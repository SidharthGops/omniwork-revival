from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import members_col
from app.ws_manager import manager

router = APIRouter(prefix="/api/cafeteria", tags=["cafeteria"])


class CafeteriaMessage(BaseModel):
    sender_id: str
    text: str


@router.post("/message")
async def post_message(body: CafeteriaMessage):
    """Backs the Cafeteria overlay on the dashboard — an ephemeral, no-agenda chat.
    No persistence on purpose (it's meant to feel like a live room, not a
    searchable log); it just fans a message out over the same websocket the rest
    of the app already uses to whoever has the overlay open right now."""
    try:
        sender_oid = ObjectId(body.sender_id)
    except (InvalidId, TypeError):
        raise HTTPException(400, "Invalid sender id")
    sender = await members_col.find_one({"_id": sender_oid})
    if not sender:
        raise HTTPException(404, "Sender not found")

    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Empty message")

    await manager.broadcast("cafeteria_message", {
        "sender_name": sender["name"],
        "text": text,
        "at": datetime.utcnow().isoformat(),
    })
    return {"ok": True}
