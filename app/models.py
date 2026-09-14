from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class PresenceStatus(str, Enum):
    available = "available"
    focused = "focused"
    away = "away"
    blocked = "blocked"


class Member(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    role: str = "Team member"
    status: PresenceStatus = PresenceStatus.available
    # Simulated Zoom state, since we don't have a registered Zoom app for real presence.
    in_zoom_call: bool = False
    blocked_reason: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str
    assignee_id: int = Field(foreign_key="member.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Checkpoint(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    task_id: int = Field(foreign_key="task.id")
    title: str
    order: int
    done: bool = False


class AvatarExchange(SQLModel, table=True):
    """Logged transcript of an avatar-to-avatar reach-out, shown in the lead UI."""
    id: Optional[int] = Field(default=None, primary_key=True)
    requester_id: int = Field(foreign_key="member.id")
    target_id: int = Field(foreign_key="member.id")
    transcript: str  # newline-separated turns, stored as plain text for the demo
    created_at: datetime = Field(default_factory=datetime.utcnow)
