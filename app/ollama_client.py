import json
import logging
import os

import httpx

logger = logging.getLogger("omniwork.ollama")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b-instruct-q4_K_M")

CHECKLIST_SYSTEM_PROMPT = """You split a project description into a short, ordered checklist of \
concrete checkpoints for one engineer to work through. Reply with ONLY valid JSON, no prose, no \
markdown fences, in this exact shape:
{"title": "short project title", "checkpoints": ["step one", "step two", "step three"]}
Keep it to 3-6 checkpoints. Each checkpoint should be a short, concrete task, not a vague phase."""


async def generate_checklist(description: str) -> dict:
    """Calls Ollama and returns {"title": str, "checkpoints": [str, ...]}.
    Falls back to a naive split if Ollama is unreachable or returns bad JSON,
    so the demo doesn't die if the model isn't running.
    """
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": f"{CHECKLIST_SYSTEM_PROMPT}\n\nProject description:\n{description}",
        "stream": False,
        "format": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
            resp.raise_for_status()
            raw = resp.json()["response"]
            parsed = json.loads(raw)
            title = parsed.get("title") or description[:60]
            checkpoints = parsed.get("checkpoints") or []
            if not checkpoints:
                raise ValueError("empty checkpoints")
            return {"title": title, "checkpoints": checkpoints}
    except Exception:
        # Fallback so the lead page still works if Ollama isn't up yet, but log
        # the real reason so "model not found" and "connection refused" aren't
        # both invisible behind the same placeholder text.
        logger.exception(
            "generate_checklist: Ollama call failed (url=%s, model=%s) — falling back",
            OLLAMA_URL, OLLAMA_MODEL,
        )
        return {
            "title": description[:60],
            "checkpoints": ["Scope the work", "Build the core piece", "Test and hand off"],
        }


async def _ollama_chat(system_prompt: str, user_prompt: str) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": f"{system_prompt}\n\n{user_prompt}",
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
            resp.raise_for_status()
            return resp.json()["response"].strip()
    except Exception:
        # This is the function the AI-avatar "reach" feature calls twice per
        # exchange — if you're seeing "(Ollama unreachable, using placeholder
        # reply)" on a reach-out, this except block is where it comes from.
        # Check the uvicorn console for the logged reason right above each
        # occurrence (connection refused = Ollama isn't running / wrong port;
        # 404 = OLLAMA_MODEL isn't pulled under that exact tag).
        logger.exception(
            "_ollama_chat: Ollama call failed (url=%s, model=%s) — falling back",
            OLLAMA_URL, OLLAMA_MODEL,
        )
        return "(Ollama unreachable, using placeholder reply)"


CHECKIN_SYSTEM_PROMPT = """You track progress on a checklist for one person. Given the current \
checkpoints (numbered from 0) and a short spoken update from the person doing the work, decide \
which checkpoint indices are now complete based on what they said. Only mark something complete \
if the update clearly says it's done or finished. Reply with ONLY valid JSON, no prose:
{"completed_indices": [0, 2], "ack": "one short, natural acknowledgement sentence"}"""


async def parse_checkin(checkpoints: list, message: str) -> dict:
    """Returns {"completed_indices": [int, ...], "ack": str}. Falls back to no
    updates (but still returns an ack) if Ollama is unreachable."""
    numbered = "\n".join(f"{i}: {c}" for i, c in enumerate(checkpoints))
    prompt = f"{CHECKIN_SYSTEM_PROMPT}\n\nCheckpoints:\n{numbered}\n\nUpdate: {message}"
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "format": "json"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
            resp.raise_for_status()
            parsed = json.loads(resp.json()["response"])
            completed = [i for i in (parsed.get("completed_indices") or []) if isinstance(i, int)]
            ack = parsed.get("ack") or "Got it, thanks for the update."
            return {"completed_indices": completed, "ack": ack}
    except Exception:
        logger.exception(
            "parse_checkin: Ollama call failed (url=%s, model=%s) — falling back",
            OLLAMA_URL, OLLAMA_MODEL,
        )
        return {
            "completed_indices": [],
            "ack": "Noted (Ollama unreachable, progress wasn't auto-updated).",
        }


async def run_avatar_exchange(requester_name: str, target_name: str, target_status: str,
                               target_task_title: str, reason: str) -> str:
    """Two-turn simulated exchange between the requester's avatar and the target's avatar.
    Returns a small transcript, so the UI can show real model output for the 'AI avatar
    checks how busy they are' feature even without real Zoom/Slack presence data.
    """
    ask_prompt = (
        f"You are {requester_name}'s AI avatar. You need to reach {target_name} because: "
        f"{reason}. Write one short message (1-2 sentences) to {target_name}'s AI avatar asking "
        f"if they're free, or if not, when they might be."
    )
    ask = await _ollama_chat("You write brief, casual workplace messages.", ask_prompt)

    reply_prompt = (
        f"You are {target_name}'s AI avatar. {target_name}'s current status is '{target_status}' "
        f"and they are working on '{target_task_title}'. {requester_name}'s avatar just said: "
        f'"{ask}". Reply in 1-2 short sentences, staying true to their current status.'
    )
    reply = await _ollama_chat("You write brief, casual workplace messages.", reply_prompt)

    return f"{requester_name}'s avatar: {ask}\n{target_name}'s avatar: {reply}"


ASSISTANT_ROUTE_SYSTEM_PROMPT = """You control an AI assistant that can reach ONE teammate through \
their AI avatar, on behalf of a team lead. You are given the team roster (name, current status, and \
blocked reason if any) and the lead's message.

First decide: is the lead clearly asking to reach, ping, contact, check on, or nudge one specific \
teammate right now — either by name, or by describing them via their current status (e.g. "whoever's \
blocked", "whoever's away")? Only say yes if that's really what they want.

Do NOT treat a greeting ("hey", "hi"), small talk, or a general question about the team (e.g. \
"who's away right now?", "how's everyone doing?", "what's Priya working on?") as a request to reach \
someone — those should get reach=false, with a short direct natural-language answer/reply in "text" \
instead (answer general questions using the roster data below when you can).

Reply with ONLY valid JSON, no prose, in this exact shape:
{"reach": true or false, "target_name": "exact name from the roster, or null if reach is false", "text": "a short reason for the reach-out if reach is true, or a short direct reply to the lead if reach is false"}"""


async def route_ping(message: str, members: list) -> dict:
    """Backs the AI-assistant chat panel on the Dashboard: turns a free-text lead
    message into either {"reach": True, "target_name": ..., "text": <reason>} (fire
    a reach-out) or {"reach": False, "target_name": None, "text": <reply>} (just
    answer/acknowledge — a greeting, small talk, or a general question isn't a
    request to interrupt someone). `members` is a list of small dicts —
    {"name", "status", "blocked_reason"} — not full DB documents.

    Calls the same local Ollama server/model as everything else in this file
    (OLLAMA_URL / OLLAMA_MODEL above), so this goes to your local model and back
    exactly like generate_checklist/parse_checkin/run_avatar_exchange do.
    Falls back to a simple heuristic (name mentioned in the message, else a
    status word mentioned in the message matched against the roster) if Ollama
    is unreachable — and, importantly, defaults to reach=False rather than
    guessing a target, so a message the heuristic can't place doesn't
    accidentally page someone.
    """
    roster = "\n".join(
        f"- {m['name']} (status: {m['status']}"
        + (f", blocked on: {m['blocked_reason']})" if m.get("blocked_reason") else ")")
        for m in members
    )
    prompt = f"{ASSISTANT_ROUTE_SYSTEM_PROMPT}\n\nRoster:\n{roster}\n\nMessage: {message}"
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "format": "json"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
            resp.raise_for_status()
            parsed = json.loads(resp.json()["response"])
            reach = bool(parsed.get("reach"))
            target_name = parsed.get("target_name") if reach else None
            text = parsed.get("text") or (message if reach else "Got it.")
            if reach and not target_name:
                # Model said "reach" but didn't actually name anyone — treat as
                # unresolved rather than guessing.
                reach = False
                text = "I wasn't sure who you meant — try naming them directly, e.g. \"check on priya\"."
            return {"reach": reach, "target_name": target_name, "text": text}
    except Exception:
        logger.exception(
            "route_ping: Ollama call failed (url=%s, model=%s) — falling back to heuristic",
            OLLAMA_URL, OLLAMA_MODEL,
        )
        lower = message.lower()
        by_name = next(
            (m for m in members if m["name"].lower() in lower or lower in m["name"].lower()),
            None,
        )
        if by_name:
            return {"reach": True, "target_name": by_name["name"], "text": message}
        status_words = ["blocked", "stuck", "away", "focused", "busy", "call", "zoom"]
        if any(w in lower for w in status_words):
            by_status = next((m for m in members if m.get("blocked_reason")), None) \
                or next((m for m in members if m["status"] != "available"), None)
            if by_status:
                return {"reach": True, "target_name": by_status["name"], "text": message}
        return {
            "reach": False,
            "target_name": None,
            "text": "Ollama's unreachable right now, so I can't tell who you mean — "
                    "try the \"Reach via AI avatar\" button on their card directly.",
        }
