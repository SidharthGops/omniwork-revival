import { useAuth } from "../context/AuthContext";
import { useCompanion } from "../context/CompanionContext";

// Only rendered for team leads — this is what makes 🔴 Blocked an
// organizational signal instead of a private one: the AI's first attempt
// and the team-memory matches are visible to the lead immediately, with no
// meeting required.
export default function TeamLeadAlerts() {
  const { user } = useAuth();
  const companion = useCompanion();

  if (user?.role !== "lead") return null;

  const alerts = companion?.leadAlerts || [];

  return (
    <div className="panel">
      <h2>Team alerts</h2>
      {alerts.length === 0 && (
        <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          Nothing right now — you'll see it here the moment a teammate flags themselves blocked.
        </p>
      )}
      {alerts.map((a) => (
        <div className="lead-alert-item" key={a._id}>
          <div className="lead-alert-header">
            <strong>{a.name}</strong>
            {a.email && (
              <a className="lead-alert-contact" href={`mailto:${a.email}`}>
                Reach out
              </a>
            )}
          </div>
          <p className="lead-alert-problem">"{a.problem}"</p>
          <p className="lead-alert-suggestion">{a.aiSuggestion}</p>
        </div>
      ))}
    </div>
  );
}
