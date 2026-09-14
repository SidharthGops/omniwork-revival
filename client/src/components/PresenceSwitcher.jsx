import { useState } from "react";
import { api } from "../api/client";

const STATUSES = [
  { key: "available", label: "Available" },
  { key: "focused", label: "Focused" },
  { key: "away", label: "Away" },
  { key: "blocked", label: "Blocked" },
];

// User-set presence — no camera, no activity tracking.
//
// Writes go through the REST PATCH /api/presence endpoint, not a socket
// emit. A socket emit is fire-and-forget: if the /presence socket happened
// to be reconnecting (or never connected) when you clicked, the click did
// nothing and there was no way to tell. A REST call always resolves or
// rejects, so a failed write shows an error and rolls the pill back instead
// of silently leaving the DB out of sync with what the button shows.
// The server still broadcasts presence:update over the socket afterward, so
// every other open tab/device for the team sees the change live.
export default function PresenceSwitcher({ initialStatus = "available" }) {
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [askingBlocked, setAskingBlocked] = useState(false);
  const [blockedNote, setBlockedNote] = useState("");
  const [error, setError] = useState("");

  async function setPresence(next, note) {
    const previous = status;
    setStatus(next); // optimistic, for a snappy click
    setSaving(true);
    setError("");
    try {
      await api.patch("/api/presence", { status: next, note: note || "" });
    } catch {
      setStatus(previous); // the write didn't land — don't show a status the DB doesn't have
      setError("Couldn't update your status — try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleClick(key) {
    if (key === "blocked") {
      setAskingBlocked(true);
      return;
    }
    setAskingBlocked(false);
    setPresence(key);
  }

  function confirmBlocked(e) {
    e.preventDefault();
    if (!blockedNote.trim()) return;
    setPresence("blocked", blockedNote.trim());
    setAskingBlocked(false);
    setBlockedNote("");
  }

  return (
    <div>
      <div className="presence-row">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            className="presence-pill"
            data-status={s.key}
            data-active={status === s.key}
            disabled={saving}
            onClick={() => handleClick(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="error-text" style={{ marginTop: 6 }}>
          {error}
        </p>
      )}

      {askingBlocked && (
        <form className="blocked-note-form" onSubmit={confirmBlocked}>
          <label htmlFor="blocked-note">
            What's blocking you? This goes straight to your AI companion and your team lead.
          </label>
          <textarea
            id="blocked-note"
            rows={2}
            value={blockedNote}
            onChange={(e) => setBlockedNote(e.target.value)}
            placeholder="e.g. Can't figure out how to structure the API auth flow"
            autoFocus
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit">Mark blocked + get help</button>
            <button type="button" className="secondary" onClick={() => setAskingBlocked(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
