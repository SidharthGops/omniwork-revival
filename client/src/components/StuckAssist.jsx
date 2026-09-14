import { useState } from "react";
import { api } from "../api/client";

// The "Blocked" flow: AI brainstorm first, then a team-memory search for a
// similar past problem and who solved it.
export default function StuckAssist() {
  const [problem, setProblem] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!problem.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post("/api/assist/stuck", { problem });
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <h2>Ask the companion directly</h2>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: -6 }}>
        A one-off ask that doesn't change your status or notify your lead. Setting your status to
        Blocked above does both of those automatically.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="problem">What's blocking you?</label>
          <textarea
            id="problem"
            rows={3}
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Searching..." : "Get help"}
        </button>
      </form>

      {result && (
        <div className="assist-result">
          <strong>Companion suggestion</strong>
          <p>{result.aiSuggestion}</p>

          {result.matches.length > 0 ? (
            result.matches.map((m, i) => (
              <div className="match-item" key={i}>
                <strong>{m.title}</strong> — solved by {m.solvedBy}
                <p style={{ margin: "4px 0 0" }}>{m.solution}</p>
              </div>
            ))
          ) : (
            <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 10 }}>
              No close matches in the team's knowledge base yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
