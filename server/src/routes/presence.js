import { Router } from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { handleBlocked } from "../services/blockedFlow.js";

const router = Router();
router.use(requireAuth);

const VALID_STATUSES = ["available", "focused", "away", "blocked"];

// Presence writes go through this REST endpoint rather than a socket emit
// (sockets/presence.js used to have a "presence:set" listener that did this
// same write — it's been removed to avoid two divergent code paths). A
// socket emit is fire-and-forget: if the client's /presence socket happened
// to be mid-reconnect, the click silently did nothing and the DB never
// changed. A REST call always gives the client a definite success/failure,
// so "every status change lands in the DB" is enforceable instead of best-effort.
router.patch("/", async (req, res) => {
  const { status, note } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "status must be one of: " + VALID_STATUSES.join(", ") });
  }

  const user = await User.findByIdAndUpdate(
    req.userId,
    { presence: { status, note: note || "", updatedAt: new Date() } },
    { new: true }
  ).select("name presence team");

  if (!user) return res.status(404).json({ error: "User not found" });

  const io = req.app.get("io");
  io?.of("/presence").to(`team:${req.teamId}`).emit("presence:update", {
    userId: req.userId,
    name: user.name,
    presence: user.presence,
  });

  // Flipping to Blocked with a note is itself the "I'm stuck" signal — same
  // trigger the old socket handler had, just fired from here now.
  if (status === "blocked" && note?.trim() && req.teamId) {
    handleBlocked(io, {
      userId: req.userId,
      teamId: req.teamId,
      problem: note.trim(),
    }).catch((err) => console.error("[companion] handleBlocked failed:", err));
  }

  res.json(user.presence);
});

export default router;
