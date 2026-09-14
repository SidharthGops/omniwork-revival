import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCompanion } from "../context/CompanionContext";

function CheckInReply({ message }) {
  const companion = useCompanion();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await companion.reply(draft.trim(), { taskId: message.meta?.taskId, projectId: message.meta?.projectId });
      setSent(true);
      setOpen(false);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  if (sent) return null;

  return open ? (
    <form className="companion-reply-form" onSubmit={submit}>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="What's the status?"
      />
      <button type="submit" disabled={sending}>{sending ? "Sending..." : "Reply"}</button>
    </form>
  ) : (
    <button className="secondary companion-reply-toggle" onClick={() => setOpen(true)}>
      Reply
    </button>
  );
}

// The dashboard's AI assistant: a running chat with the local Ollama model
// that also carries proactive check-ins and (for leads) teammate pings.
// A lead can type something like "ping Priya to check on the dashboard UI"
// and the assistant recognizes the ping intent and delivers it straight
// into that teammate's own feed here — the server enforces that only leads
// can actually trigger a send, regardless of what the client shows.
export default function CompanionPanel() {
  const { user } = useAuth();
  const companion = useCompanion();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  if (!companion) return null; // context not mounted yet (e.g. mid-logout)

  const messages = companion.messages || [];

  async function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try {
      await companion.sendChat(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="panel">
      <h2>AI assistant</h2>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: -6 }}>
        {user?.role === "lead"
          ? 'Chat normally, or ask it to ping a teammate — e.g. "ping Priya to check on the dashboard UI."'
          : "Chat with your companion here. Pings from your lead and proactive check-ins show up in this feed too."}
      </p>
      <div className="companion-feed">
        {messages.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
            Nothing yet — say hi, or your companion will check in as work progresses.
          </p>
        )}
        {messages.map((m) => {
          const fromAI = !m.author; // authorLabel set (or author falsy) means it's the AI, not a person
          return (
            <div className="companion-message" data-author={fromAI ? "ai" : "user"} key={m._id}>
              {fromAI && (
                <span className="companion-message-label">
                  {m.kind === "ping" ? `Ping from ${m.meta?.from || "your lead"}` : "AI companion"}
                </span>
              )}
              <p>{m.text}</p>
              {fromAI && m.kind === "checkin" && <CheckInReply message={m} />}
            </div>
          );
        })}
      </div>
      <form className="chat-input-row" style={{ marginTop: 12 }} onSubmit={sendMessage}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            user?.role === "lead" ? "Message the assistant, or ask it to ping someone…" : "Message the assistant…"
          }
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
