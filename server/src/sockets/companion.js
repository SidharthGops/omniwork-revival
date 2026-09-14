import jwt from "jsonwebtoken";

// The delivery channel for proactive companion messages. Unlike /presence
// and /rooms, the client never *emits* anything meaningful here (replies go
// through the REST /api/companion/reply endpoint so they're durably
// persisted) — this namespace exists purely so the server can push.
export function registerCompanionSocket(io) {
  const nsp = io.of("/companion");

  nsp.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.sub;
      socket.teamId = payload.team;
      socket.role = payload.role;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  nsp.on("connection", (socket) => {
    // Personal channel — proactive check-ins and stuck-assist results.
    socket.join(`user:${socket.userId}`);
    // Leads additionally get blocked-teammate alerts for their team.
    if (socket.role === "lead" && socket.teamId) {
      socket.join(`leads:${socket.teamId}`);
    }
  });
}
