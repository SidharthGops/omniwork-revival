import json
import os

import httpx

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")

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
        # Fallback so the lead page still works if Ollama isn't up yet.
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
