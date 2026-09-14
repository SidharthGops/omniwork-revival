import { useState } from "react";
import { useSockets } from "../context/SocketContext";

const STATUSES = [
  { key: "available", label: "Available" },
  { key: "focused", label: "Focused" },
  { key: "away", label: "Away" },
  { key: "blocked", label: "Blocked" },
];

// User-set presence — no camera, no activity tracking. Broadcasts over the
// /presence socket namespace so teammates see it update live.
export default function PresenceSwitcher({ initialStatus = "available" }) {
  const sockets = useSockets();
  const [status, setStatus] = useState(initialStatus);

  function setPresence(next) {
    setStatus(next);
    sockets?.presence.emit("presence:set", { status: next });
  }

  return (
    <div className="presence-row">
      {STATUSES.map((s) => (
        <button
          key={s.key}
          className="presence-pill"
          data-status={s.key}
          data-active={status === s.key}
          onClick={() => setPresence(s.key)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
