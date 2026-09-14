import jwt from "jsonwebtoken";
import User from "../models/User.js";

const VALID_STATUSES = ["available", "focused", "away", "blocked"];

// Presence is user-set, not detected — that's the whole point of the pitch.
// A socket just authenticates once, joins its team's room, and broadcasts
// status changes to teammates. No polling, no camera, no mouse tracking.
export function registerPresenceSocket(io) {
  const nsp = io.of("/presence");

  nsp.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.sub;
      socket.teamId = payload.team;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  nsp.on("connection", (socket) => {
    if (socket.teamId) socket.join(`team:${socket.teamId}`);

    socket.on("presence:set", async ({ status, note }) => {
      if (!VALID_STATUSES.includes(status)) return;

      const user = await User.findByIdAndUpdate(
        socket.userId,
        { presence: { status, note: note || "", updatedAt: new Date() } },
        { new: true }
      ).select("name presence");

      if (!user) return;

      nsp.to(`team:${socket.teamId}`).emit("presence:update", {
        userId: socket.userId,
        name: user.name,
        presence: user.presence,
      });
    });
  });
}
