from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class PresenceStatus(str, Enum):
    available = "available"
    focused = "focused"
    away = "away"
    blocked = "blocked"


# These used to be SQLModel ORM tables (table=True, primary_key, foreign_key).
# MongoDB has no fixed schema and nothing to migrate, so they're now plain
# Pydantic models that just describe the shape of a document in each
# collection — database.py and the routers read/write dicts against Motor
# directly. `id` is Mongo's `_id` (an ObjectId), always converted to a plain
# string the moment it leaves the database layer, and back to ObjectId the
# moment it's used in a query.

class Member(BaseModel):
    id: Optional[str] = None
    name: str
    role: str = "Team member"
    status: PresenceStatus = PresenceStatus.available
    # Simulated Zoom state, since we don't have a registered Zoom app for real presence.
    in_zoom_call: bool = False
    blocked_reason: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Task(BaseModel):
    id: Optional[str] = None
    title: str
    description: str
    assignee_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # The free-text sentence a member types during check-in used to vanish
    # the instant Ollama turned it into checkpoint ticks — nothing kept the
    # actual words. These two fields are what let the lead's dashboard show
    # "what did they last say" instead of just a percentage bar.
    last_update_note: Optional[str] = None
    last_checkin_at: Optional[datetime] = None


class Checkpoint(BaseModel):
    id: Optional[str] = None
    task_id: str
    title: str
    order: int
    done: bool = False


class AvatarExchange(BaseModel):
    """Logged transcript of an avatar-to-avatar reach-out, shown in the lead UI."""
    id: Optional[str] = None
    requester_id: str
    target_id: str
    transcript: str  # newline-separated turns, stored as plain text for the demo
    created_at: datetime = Field(default_factory=datetime.utcnow)