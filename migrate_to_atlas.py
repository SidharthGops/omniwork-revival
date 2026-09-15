"""One-off script: copies your existing local SQLite state (omniwork.db) into
MongoDB Atlas, so switching the app over to Atlas doesn't lose the current
team/task/checkpoint data.

Run this ONCE, after `pip install -r requirements.txt` and before starting the
app against Atlas:

    python migrate_to_atlas.py

It refuses to run if the Atlas `members` collection already has data, so it's
safe even if you accidentally run it twice.
"""
import sqlite3
from datetime import datetime

from pymongo import MongoClient

from app.database import MONGO_DB_NAME, MONGO_URI

SQLITE_PATH = "omniwork.db"


def _rows(conn, table):
    conn.row_factory = sqlite3.Row
    return [dict(r) for r in conn.execute(f"SELECT * FROM {table}").fetchall()]


def _parse_dt(value):
    if value is None:
        return datetime.utcnow()
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return datetime.utcnow()


def main():
    conn = sqlite3.connect(SQLITE_PATH)
    # SQLModel's default table name is just the lowercased class name.
    members = _rows(conn, "member")
    tasks = _rows(conn, "task")
    checkpoints = _rows(conn, "checkpoint")
    exchanges = _rows(conn, "avatarexchange")
    conn.close()

    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB_NAME]

    if db.members.find_one({}):
        print(
            "Atlas 'members' collection already has data — refusing to run twice. "
            "Drop it manually first (in Atlas or with a mongo shell) if you really "
            "want to re-migrate from scratch."
        )
        return

    # Integer SQLite ids -> newly generated Mongo ObjectId strings. Everything
    # that referenced an old integer id (assignee_id, task_id, requester_id,
    # target_id) gets remapped through these dicts as it's inserted.
    member_id_map = {}
    for m in members:
        doc = {
            "name": m["name"],
            "role": m["role"],
            "status": m["status"],
            "in_zoom_call": bool(m["in_zoom_call"]),
            "blocked_reason": m["blocked_reason"],
            "updated_at": _parse_dt(m["updated_at"]),
        }
        result = db.members.insert_one(doc)
        member_id_map[m["id"]] = str(result.inserted_id)

    task_id_map = {}
    for t in tasks:
        doc = {
            "title": t["title"],
            "description": t["description"],
            "assignee_id": member_id_map.get(t["assignee_id"]),
            "created_at": _parse_dt(t["created_at"]),
            # These two columns don't exist in the old SQLite schema, so every
            # migrated task starts with no check-in note until the member's
            # next check-in.
            "last_update_note": None,
            "last_checkin_at": None,
        }
        result = db.tasks.insert_one(doc)
        task_id_map[t["id"]] = str(result.inserted_id)

    for c in checkpoints:
        db.checkpoints.insert_one({
            "task_id": task_id_map.get(c["task_id"]),
            "title": c["title"],
            "order": c["order"],
            "done": bool(c["done"]),
        })

    for e in exchanges:
        db.avatar_exchanges.insert_one({
            "requester_id": member_id_map.get(e["requester_id"]),
            "target_id": member_id_map.get(e["target_id"]),
            "transcript": e["transcript"],
            "created_at": _parse_dt(e["created_at"]),
        })

    print(
        f"Migrated {len(members)} members, {len(tasks)} tasks, "
        f"{len(checkpoints)} checkpoints, {len(exchanges)} avatar exchanges to Atlas."
    )


if __name__ == "__main__":
    main()