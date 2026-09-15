import os

from motor.motor_asyncio import AsyncIOMotorClient

from app.models import Member

# Same pattern as OLLAMA_URL/SLACK_BOT_TOKEN elsewhere in this app: read from
# the environment, fall back to a hardcoded default. The default here is
# your actual Atlas cluster — override it by setting MONGO_URI if this ever
# needs to point somewhere else (a different cluster, a teammate's own dev
# database, etc).
MONGO_URI = os.environ.get(
    "MONGO_URI",
    "mongodb://sidharth-gopan:sidhgops@ac-zlyuqwn-shard-00-00.hlwxexh.mongodb.net:27017,"
    "ac-zlyuqwn-shard-00-01.hlwxexh.mongodb.net:27017,"
    "ac-zlyuqwn-shard-00-02.hlwxexh.mongodb.net:27017/"
    "?ssl=true&replicaSet=atlas-ryr5t9-shard-0&authSource=admin&appName=Cluster0",
)
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "omniwork")

client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB_NAME]

# One collection per SQLModel table this app used to have. Mongo has no
# schema/migration step, so there's no equivalent of SQLModel.metadata.create_all()
# — a collection just exists the first time something is inserted into it.
members_col = db["members"]
tasks_col = db["tasks"]
checkpoints_col = db["checkpoints"]
avatar_exchanges_col = db["avatar_exchanges"]


async def init_db() -> None:
    """Seed a small demo team the first time the `members` collection is
    empty — same behavior as before, just against Mongo instead of SQLite.

    If you're migrating existing state instead of starting fresh, run
    migrate_to_atlas.py first: it copies your local omniwork.db data in,
    which means `members` will already be non-empty and this will no-op,
    leaving your migrated data alone.
    """
    existing = await members_col.find_one({})
    if existing:
        return
    demo_members = [
        Member(name="Alex Rao", role="Backend engineer").dict(exclude={"id"}),
        Member(name="Priya Nair", role="Frontend engineer").dict(exclude={"id"}),
        Member(name="Sam George", role="Design").dict(exclude={"id"}),
    ]
    await members_col.insert_many(demo_members)