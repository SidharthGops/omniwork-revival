// Single entry point for every LLM-backed feature: checklist generation,
// check-in message drafting, and stuck-employee brainstorming.
//
// Fail-proof by design: every export wraps its LLM call in a try/catch and
// falls back to a canned-but-useful response. A flaky or missing API key
// degrades the feature, it never crashes the request.

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

async function callClaude(systemPrompt, userPrompt, maxTokens = 500) {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json();
  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in Anthropic response");
  return textBlock.text;
}

// --- 1. Checklist generation -------------------------------------------------

export async function generateChecklist(projectTitle, projectDescription) {
  const fallback = [
    "Define scope and requirements",
    "Set up project structure",
    "Build core functionality",
    "Test end to end",
    "Ship and gather feedback",
  ];

  try {
    const raw = await callClaude(
      "You break software/product projects into a short, ordered checklist of 4-7 concrete tasks. " +
        "Respond with ONLY a JSON array of short task title strings, nothing else.",
      `Project: ${projectTitle}\nDescription: ${projectDescription}`
    );
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return fallback;
  } catch (err) {
    console.warn("[ai] generateChecklist fell back:", err.message);
    return fallback;
  }
}

// --- 2. Check-in message drafting -------------------------------------------

export async function draftCheckIn(taskTitle, lastUpdateText) {
  const fallback = `Quick check — how's "${taskTitle}" going? Reply whenever you get a moment, no rush.`;

  try {
    const raw = await callClaude(
      "You are a low-key, non-intrusive work companion. Write ONE short, casual check-in message " +
        "(under 25 words) asking about progress on a task. Never sound like a manager. No preamble, just the message.",
      `Task: ${taskTitle}\nLast known update: ${lastUpdateText || "none yet"}`,
      100
    );
    return raw.trim();
  } catch (err) {
    console.warn("[ai] draftCheckIn fell back:", err.message);
    return fallback;
  }
}

// --- 3. Stuck / brainstorm assist -------------------------------------------

export async function brainstormHelp(problemText) {
  const fallback =
    "I don't have a ready answer for that one — but I've logged it and flagged it to your team's " +
    "knowledge base search. Want me to look for a teammate who's solved something similar?";

  try {
    const raw = await callClaude(
      "You are a helpful, concise engineering assistant embedded in a work-companion tool. " +
        "Someone is stuck. Give 2-3 short, concrete suggestions (under 80 words total). " +
        "If you genuinely can't help, say so plainly in one sentence.",
      problemText,
      250
    );
    return raw.trim();
  } catch (err) {
    console.warn("[ai] brainstormHelp fell back:", err.message);
    return fallback;
  }
}
