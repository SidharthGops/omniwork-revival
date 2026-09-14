import { Router } from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Team roster — feeds the "assign to" dropdown in Project Management and
// the ping-target list the assistant chatbot resolves names against.
// Scoped to the caller's own team only.
router.get("/members", async (req, res) => {
  const members = await User.find({ team: req.teamId }).select("name role presence");
  res.json(members);
});

export default router;
