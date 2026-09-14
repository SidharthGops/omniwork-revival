import jwt from "jsonwebtoken";

// Presence is user-set, not detected. The actual write now happens in
// routes/presence.js (PATCH /api/presence) — this namespace exists purely
// to authenticate once, join the team's broadcast room, and relay the
// presence:update events that route pushes. It used to also own a
// "presence:set" socket handler that duplicated that same write; having two
// places that could write presence was itself a bug risk (they could drift,
// and the socket path had no way to report a failed write back to the UI),
// so that handler was removed in favor of the single REST path.
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
  });
}
