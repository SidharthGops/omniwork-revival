import { useEffect, useState } from "react";
import { useSockets } from "../context/SocketContext";

// Live-updating list of teammates' self-set status, driven purely by
// presence:update broadcasts — no polling.
export default function TeammatePresence() {
  const sockets = useSockets();
  const [teammates, setTeammates] = useState({});

  useEffect(() => {
    if (!sockets) return;
    function onUpdate({ userId, name, presence }) {
      setTeammates((prev) => ({ ...prev, [userId]: { name, presence } }));
    }
    sockets.presence.on("presence:update", onUpdate);
    return () => sockets.presence.off("presence:update", onUpdate);
  }, [sockets]);

  const entries = Object.entries(teammates);

  return (
    <div className="panel">
      <h2>Team presence</h2>
      {entries.length === 0 && (
        <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          Updates appear here as teammates change status.
        </p>
      )}
      {entries.map(([id, t]) => (
        <div className="teammate-status" key={id}>
          <span className="dot" data-status={t.presence.status} />
          <span>{t.name}</span>
          <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>
            {t.presence.status}
          </span>
        </div>
      ))}
    </div>
  );
}
