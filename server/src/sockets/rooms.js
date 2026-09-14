import jwt from "jsonwebtoken";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { ROOMS } from "../routes/rooms.js";

// The digital cafeteria — lightweight drop-in chat rooms, no persistent
// avatars or floorplan. Cut this file first if you're short on hackathon time.
export function registerRoomsSocket(io) {
  const nsp = io.of("/rooms");

  nsp.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  nsp.on("connection", (socket) => {
    socket.on("room:join", (room) => {
      if (!ROOMS.includes(room)) return;
      socket.join(room);
    });

    socket.on("room:message", async ({ room, text }) => {
      if (!ROOMS.includes(room) || !text?.trim()) return;

      const user = await User.findById(socket.userId).select("name");
      const message = await Message.create({
        room,
        author: socket.userId,
        text: text.trim(),
      });

      nsp.to(room).emit("room:message", {
        room,
        text: message.text,
        author: { id: socket.userId, name: user?.name || "Someone" },
        createdAt: message.createdAt,
      });
    });
  });
}
