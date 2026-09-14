import { Router } from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { assistantChat } from "../services/aiOrchestrator.js";
import { sendCompanionMessage, sendUserMessage } from "../services/companionService.js";

const router = Router();
router.use(requireAuth);

// The dashboard chatbot: free-form chat against the local Ollama model,
// plus a narrow "ping a teammate" tool it can trigger. Whether a ping
// actually gets sent is decided here from the verified JWT's role — never
// from anything the client claims — so a member can't get the model to
// ping someone just by asking nicely.
router.post("/chat", async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text is required" });

  const io = req.app.get("io");
  const trimmed = text.trim();

  // Persist + push the user's own message so it shows up the same way in
  // every open tab/device for this account, not just the one that sent it.
  await sendUserMessage(io, { userId: req.userId, text: trimmed, kind: "chat" });

  const [requester, teammates] = await Promise.all([
    User.findById(req.userId).select("name role"),
    User.find({ team: req.teamId }).select("name _id"),
  ]);

  const result = await assistantChat(
    trimmed,
    teammates.map((m) => m.name),
    requester?.role
  );

  if (result.type === "ping") {
    if (requester?.role !== "lead") {
      await sendCompanionMessage(io, {
        userId: req.userId,
        text: "Only your team lead can send pings through me.",
        kind: "assistant-reply",
      });
      return res.status(201).json({ ok: true });
    }

    const target = teammates.find(
      (m) =>
        m.name.toLowerCase() === result.target.toLowerCase() ||
        m.name.toLowerCase().includes(result.target.toLowerCase())
    );

    if (!target) {
      await sendCompanionMessage(io, {
        userId: req.userId,
        text: `I couldn't find a teammate named "${result.target}" on your team.`,
        kind: "assistant-reply",
      });
      return res.status(201).json({ ok: true });
    }

    await sendCompanionMessage(io, {
      userId: target._id.toString(),
      text: result.message,
      kind: "ping",
      meta: { from: requester.name },
    });
    await sendCompanionMessage(io, {
      userId: req.userId,
      text: `Pinged ${target.name}: "${result.message}"`,
      kind: "assistant-reply",
    });
    return res.status(201).json({ ok: true });
  }

  await sendCompanionMessage(io, {
    userId: req.userId,
    text: result.text,
    kind: "assistant-reply",
  });
  res.status(201).json({ ok: true });
});

export default router;
