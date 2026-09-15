from datetime import datetime
from typing import List

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import checkpoints_col, tasks_col
from app.ollama_client import generate_checklist
from app.ws_manager import manager

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _oid(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(400, "Invalid id")


class GenerateRequest(BaseModel):
    description: str


class GenerateResponse(BaseModel):
    title: str
    checkpoints: List[str]


class AssignRequest(BaseModel):
    title: str
    description: str
    checkpoints: List[str]
    assignee_id: str  # string ObjectId now, not an int


class CheckpointOut(BaseModel):
    id: str
    title: str
    order: int
    done: bool


class TaskOut(BaseModel):
    id: str
    title: str
    description: str
    assignee_id: str
    checkpoints: List[CheckpointOut]


@router.post("/generate", response_model=GenerateResponse)
async def generate(body: GenerateRequest):
    """Calls Ollama to split a free-text project description into checkpoints.
    The lead reviews and can edit these before assigning."""
    result = await generate_checklist(body.description)
    return result


@router.post("", response_model=TaskOut)
async def assign_task(body: AssignRequest):
    _oid(body.assignee_id)  # validate format, member existence isn't enforced here (matches prior behavior)

    task_doc = {
        "title": body.title,
        "description": body.description,
        "assignee_id": body.assignee_id,
        "last_update_note": None,
        "last_checkin_at": None,
        "created_at": datetime.utcnow(),
    }
    task_result = await tasks_col.insert_one(task_doc)
    task_id = str(task_result.inserted_id)

    checkpoint_docs = [
        {"task_id": task_id, "title": title, "order": i, "done": False}
        for i, title in enumerate(body.checkpoints)
    ]
    checkpoint_ids = []
    if checkpoint_docs:
        result = await checkpoints_col.insert_many(checkpoint_docs)
        checkpoint_ids = result.inserted_ids

    checkpoints_out = [
        CheckpointOut(id=str(cid), title=doc["title"], order=doc["order"], done=False)
        for cid, doc in zip(checkpoint_ids, checkpoint_docs)
    ]

    out = TaskOut(
        id=task_id, title=body.title, description=body.description,
        assignee_id=body.assignee_id, checkpoints=checkpoints_out,
    )
    await manager.broadcast("task_created", out.dict())
    return out


@router.post("/checkpoints/{checkpoint_id}/toggle", response_model=CheckpointOut)
async def toggle_checkpoint(checkpoint_id: str):
    cp = await checkpoints_col.find_one({"_id": _oid(checkpoint_id)})
    if not cp:
        raise HTTPException(404, "Checkpoint not found")
    new_done = not cp.get("done", False)
    await checkpoints_col.update_one({"_id": cp["_id"]}, {"$set": {"done": new_done}})

    out = CheckpointOut(id=checkpoint_id, title=cp["title"], order=cp["order"], done=new_done)
    await manager.broadcast("checkpoint_updated", {"task_id": cp["task_id"], **out.dict()})
    return out