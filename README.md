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
the app degrades gracefully instead of crashing if the LLM API is
unreachable or `ANTHROPIC_API_KEY` is unset. The vector store is a local,
offline hashing-trick embedding (no external embeddings API, no vector DB
infra) — swap it out later without touching the routes that call it.

## Run it

1. **Database** — either:
   ```
   docker compose up -d
   ```
   or point `MONGO_URI` at an existing Mongo instance / Atlas cluster.

2. **Server**
   ```
   cd server
   cp .env.example .env      # fill in JWT_SECRET, optionally ANTHROPIC_API_KEY
   npm install
   npm run seed               # creates demo team, users, project, knowledge base
   npm run dev                 # http://localhost:4000
   ```

3. **Client**
   ```
   cd client
   cp .env.example .env
   npm install
   npm run dev                 # http://localhost:5173
   ```

4. Sign in with one of the seeded accounts (password `password123`):
   - `lead@demo.dev`
   - `alex@demo.dev`
   - `priya@demo.dev`

## What's real vs. stubbed

| Feature | Status |
|---|---|
| Checklist generation | Real LLM call via `services/aiOrchestrator.js`, falls back to a generic 5-step checklist |
| AI check-in messages | Real LLM call, falls back to a canned check-in line |
| Team memory / "stuck" search | Real search over seeded knowledge entries using local embeddings — no external vector DB |
| Presence | Fully real — Socket.io broadcast, user-set only, no tracking |
| Cafeteria rooms | Fully real — Socket.io chat, persisted to Mongo |
| Slack / Zoom | Not implemented — out of scope for the hackathon window, see work plan |

## Cutting scope under time pressure

The work plan orders features so you can drop from the bottom without
breaking the demo: cafeteria rooms first, then team memory, keeping
checklist generation + presence + check-ins as the non-negotiable core.
