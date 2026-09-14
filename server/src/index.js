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
import { registerPresenceSocket } from "./sockets/presence.js";
import { registerRoomsSocket } from "./sockets/rooms.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/assist", assistRoutes);
app.use("/api/rooms", roomRoutes);

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

registerPresenceSocket(io);
registerRoomsSocket(io);

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    server.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
  })
  .catch((err) => {
    console.error("[db] failed to connect:", err.message);
    process.exit(1);
  });
