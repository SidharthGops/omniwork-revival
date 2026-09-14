// Wires the 🔴 Blocked presence state directly to the AI + team-memory
// assist flow, per the proposal: flipping to Blocked should *by itself*
// kick off "what are they stuck on -> has the team solved this before ->
// who has relevant expertise -> can the AI solve it first" without the
// person having to separately fill out a form.

import KnowledgeEntry from "../models/KnowledgeEntry.js";
import User from "../models/User.js";
import { brainstormHelp } from "./aiOrchestrator.js";
import { searchKnowledge } from "./vectorStore.js";
import { sendCompanionMessage, notifyLeads, getTeamLeads } from "./companionService.js";
import { notifySlackDM } from "./slack.js";

export async function handleBlocked(io, { userId, teamId, problem }) {
  const [aiSuggestion, entries, user] = await Promise.all([
    brainstormHelp(problem),
    KnowledgeEntry.find({ team: teamId }),
    User.findById(userId).select("name email slackUserId"),
  ]);

  const rawMatches = searchKnowledge(problem, entries, 3);
  const matches = await Promise.all(
    rawMatches.map(async ({ entry, score }) => {
      const solver = entry.solvedBy ? await User.findById(entry.solvedBy).select("name") : null;
      return {
        title: entry.title,
        solution: entry.solution,
        solvedBy: solver?.name || "a teammate",
        score: Number(score.toFixed(2)),
      };
    })
  );

  // 1. Tell the blocked person directly, in their companion feed.
  const lines = [aiSuggestion];
  if (matches.length) {
    lines.push("");
    lines.push("From the team's memory:");
    for (const m of matches) lines.push(`• ${m.title} — solved by ${m.solvedBy}: ${m.solution}`);
  }
  await sendCompanionMessage(io, {
    userId,
    text: lines.join("\n"),
    kind: "stuck",
    meta: { problem, aiSuggestion, matches },
  });

  // 2. Tell the team lead(s) — this is what makes Blocked an *organizational*
  //    signal rather than a private one, per the pitch.
  await notifyLeads(io, teamId, {
    userId,
    name: user?.name || "A teammate",
    email: user?.email || "",
    problem,
    aiSuggestion,
    matches,
  });

  // 3. Best-effort Slack mirror, if configured.
  if (user?.slackUserId) {
    notifySlackDM(user.slackUserId, `🔴 You flagged yourself blocked: "${problem}"\n\n${aiSuggestion}`).catch(() => {});
  }
  const leads = await getTeamLeads(teamId);
  await Promise.all(
    leads
      .filter((lead) => lead.slackUserId)
      .map((lead) =>
        notifySlackDM(
          lead.slackUserId,
          `🔴 ${user?.name || "A teammate"} is blocked: "${problem}"\n\nCompanion suggestion: ${aiSuggestion}`
        ).catch(() => {})
      )
  );

  return { aiSuggestion, matches };
}
