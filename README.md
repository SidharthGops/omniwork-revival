# OmniWork revival — scaffold

An AI-powered hybrid work companion: task checklists, non-intrusive AI
check-ins, user-set presence (available / focused / away / blocked), a
team-memory knowledge search for the "I'm stuck" flow, and lightweight
cafeteria rooms.

See `/areas` in the project notes for the full architecture writeup and the
15-hour work plan this scaffold is built against.

## Structure

```
server/   Express + Socket.io + MongoDB (Mongoose)
client/   React (Vite)
```

Every AI/vector call in `server/src/services/` has a built-in fallback —
the app degrades gracefully instead of crashing if the LLM is unreachable
or the model isn't pulled yet. The vector store is a local, offline
hashing-trick embedding (no external embeddings API, no vector DB infra) —
swap it out later without touching the routes that call it.

## Run it

1. **Ollama (local LLM)** — install from [ollama.com](https://ollama.com),
   then:
   ```
   ollama pull llama3.1      # or any model you prefer — update OLLAMA_MODEL to match
   ollama serve                # usually already running as a background service
   ```
   Or skip the install and use the `ollama` service in `docker-compose.yml`
   below (pull the model once with `docker compose exec ollama ollama pull llama3.1`).

2. **Database** — either:
   ```
   docker compose up -d
   ```
   or point `MONGO_URI` at an existing Mongo instance / Atlas cluster.

3. **Server**
   ```
   cd server
   cp .env.example .env      # fill in JWT_SECRET; OLLAMA_BASE_URL/OLLAMA_MODEL default to a local ollama serve
   npm install
   npm run seed               # creates demo team, users, project, knowledge base
   npm run dev                 # http://localhost:4000
   ```

4. **Client**
   ```
   cd client
   cp .env.example .env
   npm install
   npm run dev                 # http://localhost:5173
   ```

5. Sign in with one of the seeded accounts (password `password123`):
   - `lead@demo.dev`
   - `alex@demo.dev`
   - `priya@demo.dev`

## What's real vs. stubbed

| Feature | Status |
|---|---|
| Checklist generation | Real LLM call via `services/aiOrchestrator.js` against a local Ollama server, falls back to a generic 5-step checklist |
| AI check-in messages | Real LLM call, falls back to a canned check-in line |
| Team memory / "stuck" search | Real search over seeded knowledge entries using local embeddings — no external vector DB |
| Presence | Fully real — Socket.io broadcast, user-set only, no tracking |
| Cafeteria rooms | Fully real — Socket.io chat, persisted to Mongo |
| Slack / Zoom | Not implemented — out of scope for the hackathon window, see work plan |

## Using a different Ollama model

Set `OLLAMA_MODEL` in `server/.env` to any model you've pulled (`ollama list`
shows what's available locally). Smaller instruction-tuned models (e.g.
`llama3.2`, `mistral`, `qwen2.5`) work fine for the checklist/check-in/brainstorm
prompts in `aiOrchestrator.js` and respond faster on CPU-only machines than
larger ones. If `OLLAMA_BASE_URL` is unreachable or the model returns an
error, every AI feature falls back to its canned response automatically —
nothing in the app crashes or blocks on it.

## Cutting scope under time pressure

The work plan orders features so you can drop from the bottom without
breaking the demo: cafeteria rooms first, then team memory, keeping
checklist generation + presence + check-ins as the non-negotiable core.
