"""Local team-memory search for the 'stuck' feature.

Uses TF-IDF + cosine similarity instead of a hosted embedding model. This is a
deliberate hackathon tradeoff: ChromaDB's default embedding function downloads a
model from Hugging Face on first use, which is one more thing that can fail on
stage with bad wifi. TF-IDF needs no download, runs instantly, and is good enough
to demo semantic-ish matching against a small seeded corpus. Swap in real
embeddings (Chroma, sentence-transformers) later without changing the call site.

The knowledge entries themselves used to live only in the ENTRIES list below,
held in memory. They're now persisted in Mongo (knowledge_col, seeded from
ENTRIES the first time the collection is empty — see app/database.py's
init_db()), so entries survive a restart and can eventually be added to at
runtime. ENTRIES stays here as the seed data / fallback. search() is async
now (it queries the DB), which is why every call site awaits it.
"""
from dataclasses import dataclass
from typing import List, Optional

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.database import knowledge_col


@dataclass
class MemoryEntry:
    title: str
    description: str
    solution: str
    solved_by: str


ENTRIES: List[MemoryEntry] = [
    MemoryEntry(
        title="OAuth token refresh loop",
        description=(
            "Users getting logged out randomly because the refresh token wasn't "
            "being rotated correctly during concurrent requests"
        ),
        solution=(
            "Added a mutex around the refresh call so only one request refreshes "
            "the token at a time, the rest wait and reuse the new one."
        ),
        solved_by="Alex Rao",
    ),
    MemoryEntry(
        title="Dashboard chart performance",
        description=(
            "Analytics dashboard charts were freezing the browser tab once a series "
            "had more than a few thousand data points"
        ),
        solution=(
            "Switched to a canvas-based chart library and downsampled points "
            "client-side before rendering."
        ),
        solved_by="Priya Nair",
    ),
    MemoryEntry(
        title="Design handoff drift",
        description=(
            "Spacing and font sizes in the shipped UI kept drifting away from the "
            "Figma design across successive PRs"
        ),
        solution=(
            "Set up shared design tokens between Figma variables and the Tailwind "
            "config so both stay in sync automatically."
        ),
        solved_by="Sam George",
    ),
    MemoryEntry(
        title="Flaky CI on database tests",
        description=(
            "Integration tests hitting the test database were failing "
            "intermittently in CI but always passing locally"
        ),
        solution=(
            "The CI runner was reusing a stale DB container between jobs. Added a "
            "fresh container teardown step per job."
        ),
        solved_by="Alex Rao",
    ),
    MemoryEntry(
        title="API pagination bug",
        description=(
            "Clients were getting duplicate or skipped rows when paginating "
            "through a large results endpoint"
        ),
        solution=(
            "Switched from offset-based pagination to cursor-based pagination on "
            "a stable sort key."
        ),
        solved_by="Alex Rao",
    ),
]

async def search(query: str, min_similarity: float = 0.1) -> Optional[dict]:
    """Same TF-IDF + cosine-similarity approach as before, just reading the
    corpus from knowledge_col instead of the hardcoded ENTRIES list. The
    vectorizer is small and cheap enough (a handful of entries, hackathon
    scale) to rebuild on every call, which also means a newly-added knowledge
    entry is picked up immediately without needing a cache-invalidation step.
    Return shape is unchanged: {"title", "solution", "solved_by", "similarity"}.
    """
    if not query or not query.strip():
        return None
    docs = await knowledge_col.find().to_list(None)
    if not docs:
        return None
    corpus = [f"{d.get('title', '')} {d.get('description', '')}" for d in docs]
    vectorizer = TfidfVectorizer(stop_words="english")
    matrix = vectorizer.fit_transform(corpus)
    vec = vectorizer.transform([query])
    sims = cosine_similarity(vec, matrix)[0]
    best_idx = int(sims.argmax())
    if sims[best_idx] < min_similarity:
        return None
    entry = docs[best_idx]
    return {
        "title": entry["title"],
        "solution": entry["solution"],
        "solved_by": entry["solved_by"],
        "similarity": round(float(sims[best_idx]), 2),
    }
