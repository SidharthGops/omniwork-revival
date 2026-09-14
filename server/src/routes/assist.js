import { Router } from "express";
import KnowledgeEntry from "../models/KnowledgeEntry.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { brainstormHelp } from "../services/aiOrchestrator.js";
import { searchKnowledge } from "../services/vectorStore.js";

const router = Router();
router.use(requireAuth);

// The "I'm stuck" flow: try the AI first, then search the team's knowledge
// base for a similar past problem and the person who solved it.
router.post("/stuck", async (req, res) => {
  const { problem } = req.body;
  if (!problem) return res.status(400).json({ error: "problem is required" });

  const [aiSuggestion, entries] = await Promise.all([
    brainstormHelp(problem),
    KnowledgeEntry.find({ team: req.teamId }),
  ]);

  const matches = searchKnowledge(problem, entries, 3);

  const matchDetails = await Promise.all(
    matches.map(async ({ entry, score }) => {
      const solver = entry.solvedBy
        ? await User.findById(entry.solvedBy).select("name")
        : null;
      return {
        title: entry.title,
        solution: entry.solution,
        solvedBy: solver?.name || "a teammate",
        score: Number(score.toFixed(2)),
      };
    })
  );

  res.json({ aiSuggestion, matches: matchDetails });
});

export default router;
