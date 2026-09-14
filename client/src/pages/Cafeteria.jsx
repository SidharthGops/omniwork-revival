import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSockets } from "../context/SocketContext";

const ROOM_LABELS = {
  cafeteria: "Cafeteria",
  lounge: "Open lounge",
  "break-room": "Break room",
  "brainstorm-room": "Brainstorm room",
};

// Drop-in social rooms — not a persistent virtual office, just a place to
// pop into for a moment. Lowest-priority feature per the work plan.
export default function Cafeteria() {
  const { user } = useAuth();
  const sockets = useSockets();
  const [room, setRoom] = useState("cafeteria");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    api.get(`/api/rooms/${room}/messages`).then((res) => setMessages(res.data));
  }, [room]);

  useEffect(() => {
    if (!sockets) return;
    sockets.rooms.emit("room:join", room);

    function onMessage(msg) {
      if (msg.room !== room) return;
      setMessages((prev) => [...prev, msg]);
    }
    sockets.rooms.on("room:message", onMessage);
    return () => sockets.rooms.off("room:message", onMessage);
  }, [sockets, room]);

  function sendMessage(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    sockets?.rooms.emit("room:message", { room, text: draft });
    setDraft("");
  }

  return (
    <div className="panel">
      <div className="room-tabs">
        {Object.entries(ROOM_LABELS).map(([key, label]) => (
          <button
            key={key}
            data-active={room === key}
            onClick={() => setRoom(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="chat-log">
        {messages.map((m, i) => (
          <div className="chat-message" key={m._id || i}>
            <span className="who">{m.author?.name || "Someone"}</span>
            {m.text}
          </div>
        ))}
        {messages.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
            No messages yet — say hi.
          </p>
        )}
      </div>

      <form className="chat-input-row" onSubmit={sendMessage}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message #${ROOM_LABELS[room].toLowerCase()}`}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
