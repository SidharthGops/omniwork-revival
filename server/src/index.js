import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "node:http";
import { Server } from "socket.io";

import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import assistRoutes from "./routes/assist.js";
import roomRoutes from "./routes/rooms.js";
import companionRoutes from "./routes/companion.js";
import presenceRoutes from "./routes/presence.js";
import teamRoutes from "./routes/team.js";
import assistantRoutes from "./routes/assistant.js";
import { registerPresenceSocket } from "./sockets/presence.js";
import { registerRoomsSocket } from "./sockets/rooms.js";
import { registerCompanionSocket } from "./sockets/companion.js";
import { startCompanionScheduler } from "./services/companionScheduler.js";

// Refuse to boot with no secret, or with the placeholder value that ships in
// this repo's own .env.example. Signing real login tokens with a public,
// checked-in placeholder string means anyone who's ever seen this repo can
// forge a valid token for any user/team/role — this is the single highest-
// severity risk in the stack, and it fails silently otherwise (jwt.sign just
// signs with whatever string it's given).
const PLACEHOLDER_SECRET = "change-this-in-real-deployment";
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === PLACEHOLDER_SECRET) {
  console.error(
    "[boot] JWT_SECRET is missing or still set to the example placeholder in .env.example.\n" +
      "        Set a real, random value in server/.env before starting the server."
  );
  process.exit(1);
}

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/assist", assistRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/companion", companionRoutes);
app.use("/api/presence", presenceRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/assistant", assistantRoutes);

// Fallback so an unhandled route error never takes the whole server down
// mid-demo — matches the "fail-proof wiring" step in the work plan.
app.use((err, req, res, next) => {
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Something went wrong" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || "*" },
});
// Lets REST routes (presence, projects, assistant, etc.) push a companion
// message or presence broadcast through the same socket the proactive
// scheduler uses.
app.set("io", io);

registerPresenceSocket(io);
registerRoomsSocket(io);
registerCompanionSocket(io);

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    server.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
    // The proactive AI companion — periodically decides who's due a
    // check-in instead of waiting for anyone to ask for one.
    startCompanionScheduler(io);
  })
  .catch((err) => {
    console.error("[db] failed to connect:", err.message);
    process.exit(1);
  });
