from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models import Checkpoint, Task
from app.ollama_client import generate_checklist
from app.ws_manager import manager

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class GenerateRequest(BaseModel):
    description: str


class GenerateResponse(BaseModel):
    title: str
    checkpoints: List[str]


class AssignRequest(BaseModel):
    title: str
    description: str
    checkpoints: List[str]
    assignee_id: int


class CheckpointOut(BaseModel):
    id: int
    title: str
    order: int
    done: bool


class TaskOut(BaseModel):
    id: int
    title: str
    description: str
    assignee_id: int
    checkpoints: List[CheckpointOut]


@router.post("/generate", response_model=GenerateResponse)
async def generate(body: GenerateRequest):
    """Calls Ollama to split a free-text project description into checkpoints.
    The lead reviews and can edit these before assigning."""
    result = await generate_checklist(body.description)
    return result


@router.post("", response_model=TaskOut)
async def assign_task(body: AssignRequest, session: Session = Depends(get_session)):
    task = Task(title=body.title, description=body.description, assignee_id=body.assignee_id)
    session.add(task)
    session.commit()
    session.refresh(task)

    checkpoints = []
    for i, title in enumerate(body.checkpoints):
        cp = Checkpoint(task_id=task.id, title=title, order=i)
        session.add(cp)
        checkpoints.append(cp)
    session.commit()
    for cp in checkpoints:
        session.refresh(cp)

    out = TaskOut(
        id=task.id, title=task.title, description=task.description, assignee_id=task.assignee_id,
        checkpoints=[CheckpointOut(id=c.id, title=c.title, order=c.order, done=c.done) for c in checkpoints],
    )
    await manager.broadcast("task_created", out.dict())
    return out


@router.post("/checkpoints/{checkpoint_id}/toggle", response_model=CheckpointOut)
async def toggle_checkpoint(checkpoint_id: int, session: Session = Depends(get_session)):
    cp = session.get(Checkpoint, checkpoint_id)
    if not cp:
        raise HTTPException(404, "Checkpoint not found")
    cp.done = not cp.done
    session.add(cp)
    session.commit()
    session.refresh(cp)
    out = CheckpointOut(id=cp.id, title=cp.title, order=cp.order, done=cp.done)
    await manager.broadcast("checkpoint_updated", {"task_id": cp.task_id, **out.dict()})
    return out
