import { Router } from "express";
import Message from "../models/Message.js";
import Project from "../models/Project.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendCompanionMessage } from "../services/companionService.js";

const router = Router();
router.use(requireAuth);

// History of the current user's own companion feed — check-ins, stuck-assist
// results, acks. Live updates arrive over the /companion socket; this just
// backfills on load/refresh.
router.get("/messages", async (req, res) => {
  const messages = await Message.find({ room: `companion:${req.userId}` })
    .sort({ createdAt: 1 })
    .limit(200);
  res.json(messages);
});

// Lead-only: history of teammates flagging themselves blocked.
router.get("/lead-alerts", requireRole("lead"), async (req, res) => {
  const messages = await Message.find({ room: `leads:${req.teamId}` })
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(messages);
});

// Reply to a check-in — this is how "the AI quietly follows progress"
// without a meeting: a short text reply updates the task and resets the
// check-in clock so the AI doesn't ask again too soon.
router.post("/reply", async (req, res) => {
  const { text, taskId, projectId } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text is required" });

  await Message.create({
    room: `companion:${req.userId}`,
    author: req.userId,
    text: text.trim(),
    kind: "reply",
    meta: { taskId, projectId },
  });

  if (taskId && projectId) {
    const project = await Project.findOne({ _id: projectId, team: req.teamId });
    const task = project?.tasks.id(taskId);
    if (task) {
      task.lastCheckInAt = new Date();
      task.lastUpdateNote = text.trim();
      await project.save();
    }
  }

  // Pushed (not just saved) so the closing "got it" appears live without
  // the client needing to refetch.
  await sendCompanionMessage(req.app.get("io"), {
    userId: req.userId,
    text: "Got it — thanks for the update!",
    kind: "ack",
  });

  res.status(201).json({ ok: true });
});

export default router;
