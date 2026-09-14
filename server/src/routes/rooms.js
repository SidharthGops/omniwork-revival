import { Router } from "express";
import Message from "../models/Message.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

export const ROOMS = ["cafeteria", "lounge", "break-room", "brainstorm-room"];

router.get("/", (req, res) => {
  res.json(ROOMS);
});

// Message history for a room — live messages arrive over the socket "rooms" namespace.
router.get("/:room/messages", async (req, res) => {
  if (!ROOMS.includes(req.params.room)) {
    return res.status(404).json({ error: "Unknown room" });
  }
  const messages = await Message.find({ room: req.params.room })
    .sort({ createdAt: 1 })
    .limit(100)
    .populate("author", "name");
  res.json(messages);
});

export default router;
