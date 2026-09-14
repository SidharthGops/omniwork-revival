"""Local team-memory search for the 'stuck' feature.

Uses TF-IDF + cosine similarity instead of a hosted embedding model. This is a
deliberate hackathon tradeoff: ChromaDB's default embedding function downloads a
model from Hugging Face on first use, which is one more thing that can fail on
stage with bad wifi. TF-IDF needs no download, runs instantly, and is good enough
to demo semantic-ish matching against a small seeded corpus. Swap in real
embeddings (Chroma, sentence-transformers) later without changing the call site.
"""
from dataclasses import dataclass
from typing import List, Optional

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


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

_corpus = [f"{e.title} {e.description}" for e in ENTRIES]
_vectorizer = TfidfVectorizer(stop_words="english")
_matrix = _vectorizer.fit_transform(_corpus)


def search(query: str, min_similarity: float = 0.1) -> Optional[dict]:
    if not query or not query.strip():
        return None
    vec = _vectorizer.transform([query])
    sims = cosine_similarity(vec, _matrix)[0]
    best_idx = int(sims.argmax())
    if sims[best_idx] < min_similarity:
        return None
    entry = ENTRIES[best_idx]
    return {
        "title": entry.title,
        "solution": entry.solution,
        "solved_by": entry.solved_by,
        "similarity": round(float(sims[best_idx]), 2),
    }
