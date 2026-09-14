# OmniWork prototype

A working, end-to-end prototype of an AI-assisted hybrid work companion: a team
lead dashboard, a team member page, an Ollama-powered checklist splitter and
check-in loop, a local team-memory lookup for when someone's stuck, and outbound
Slack posting. Zoom presence is simulated since there's no registered Zoom app.

## Setup

```
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Install and run Ollama separately (https://ollama.com), then pull a small model:

```
ollama pull llama3.1
```

If Ollama isn't running, task generation and check-ins fall back gracefully
(generic checklist, no auto-progress) so the demo doesn't break if the model
service hiccups.

Slack is optional. If you want real Slack posts during the demo:

```
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_CHANNEL=#omniwork-status
```

Create the Slack app at https://api.slack.com/apps with the `chat:write` scope,
install it to your workspace, and invite the bot to that channel. Without these
env vars, Slack calls just no-op silently, nothing else breaks.

## Run

```
uvicorn app.main:app --reload
```

Open http://localhost:8000 for the lead dashboard, http://localhost:8000/member
for the member page. Use the member dropdown on the member page to role-play
different team members during the demo, since there's no auth layer.

## What's real vs simulated

- Task checklist generation: real, calls your local Ollama.
- Member check-in loop: real, free-text update goes to Ollama, which decides
  which checkpoints are now done. No form-filling required.
- Avatar-to-avatar exchange: real, two Ollama calls (requester avatar, target
  avatar), shown as a transcript when you hit "Reach via AI avatar" on someone
  who's busy or in a (simulated) Zoom call.
- Team memory lookup: real search, but local TF-IDF over a small seeded corpus
  instead of a hosted embedding model — no network call, no download, so it
  can't fail on stage. Swap in Chroma + real embeddings later without touching
  the call sites (see `app/team_memory.py`).
- Live status + progress: real, backed by SQLite, pushed to both pages over
  WebSocket.
- Slack: real outbound posts (status changes, avatar reach-outs) via
  `slack_sdk.WebClient`, no-ops cleanly if `SLACK_BOT_TOKEN` isn't set.
- Zoom "in a call" state: simulated with a checkbox on the lead's member cards.
  There's no registered Zoom app with the right scopes, so this stands in for
  real presence. Swapping this for the real Zoom SDK is the main piece of
  follow-up work once you have an approved app.

## Demo script (3-4 minutes)

1. On the lead page, describe a project, hit "Generate checklist with AI",
   review/edit the checkpoints, assign to someone.
2. Switch to the member page as that person, send a check-in like "finished the
   first part, starting the next one" and watch the checkpoint tick off and the
   lead's progress bar update live.
3. On the member page, mark yourself "Stuck" with a reason that resembles one of
   the seeded past incidents (try wording close to an OAuth or CI issue) and show
   the memory suggestion appear.
4. On the lead page, toggle another member into a simulated Zoom call, then hit
   "Reach via AI avatar" on them and show the two-avatar transcript.

## Structure

```
app/
  main.py           FastAPI app, mounts routers + static frontend + websocket
  models.py         SQLModel tables: Member, Task, Checkpoint, AvatarExchange
  database.py       SQLite engine + demo member seed
  ollama_client.py  Checklist generation, check-in parsing, avatar exchange
  team_memory.py    Local TF-IDF search over seeded past-incident data
  slack_bot.py      Outbound Slack posting, no-ops if not configured
  ws_manager.py     WebSocket broadcast for live updates
  routers/
    members.py      Status, zoom sim, check-in, reach/avatar exchange
    tasks.py         AI checklist generation, task assignment, checkpoint toggling
static/
  index.html        Team lead dashboard
  member.html        Team member page
```
