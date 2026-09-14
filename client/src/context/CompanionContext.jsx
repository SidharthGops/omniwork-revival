import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { io as ioClient } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { api } from "../api/client";

const CompanionContext = createContext(null);

// The live channel for the proactive AI companion. Separate from
// SocketContext's /presence and /rooms namespaces because this one is
// purely server -> client push: the AI decides when to speak, the app
// just has to be listening wherever the user currently is.
//
// IMPORTANT: this provider must actually be mounted above <App /> in
// main.jsx. Without it, useCompanion() below returns the context's default
// value (null) everywhere it's used, and the whole companion feed —
// check-ins, "I'm stuck" results, lead alerts, and now the assistant chat —
// silently renders nothing no matter what the backend sends.
export function CompanionProvider({ children }) {
  const { token, user } = useAuth();
  const baseURL = import.meta.env.VITE_API_URL || "http://localhost:4000";

  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [leadAlerts, setLeadAlerts] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return;
    }
    const s = ioClient(`${baseURL}/companion`, { auth: { token } });
    setSocket(s);
    return () => s.disconnect();
  }, [token, baseURL]);

  // Backfill history on load/refresh — live updates arrive over the socket.
  useEffect(() => {
    if (!token) {
      setMessages([]);
      setLeadAlerts([]);
      return;
    }
    api.get("/api/companion/messages").then((res) => setMessages(res.data)).catch(() => {});
    if (user?.role === "lead") {
      api.get("/api/companion/lead-alerts").then((res) => setLeadAlerts(res.data)).catch(() => {});
    }
  }, [token, user?.role]);

  useEffect(() => {
    if (!socket) return;

    function onMessage(msg) {
      setMessages((prev) => [...prev, msg]);
      // Don't toast the user's own outgoing chat bubble back at them.
      if (msg.author) return;
      setToast({ text: msg.text, authorLabel: msg.authorLabel || "AI companion" });
    }

    function onLeadAlert(alert) {
      setLeadAlerts((prev) => [alert, ...prev]);
      setToast({ text: `${alert.name} flagged themselves as blocked`, authorLabel: "AI companion" });
    }

    socket.on("companion:message", onMessage);
    socket.on("companion:teammate-blocked", onLeadAlert);
    return () => {
      socket.off("companion:message", onMessage);
      socket.off("companion:teammate-blocked", onLeadAlert);
    };
  }, [socket]);

  const reply = useCallback(async (text, ctx = {}) => {
    // Optimistic: show the user's own reply immediately. The AI's "got it"
    // ack arrives moments later over the socket and appends normally.
    setMessages((prev) => [
      ...prev,
      { _id: `local-${Date.now()}`, text, author: user?.id, kind: "reply", createdAt: new Date().toISOString() },
    ]);
    await api.post("/api/companion/reply", { text, taskId: ctx.taskId, projectId: ctx.projectId });
  }, [user?.id]);

  // Free-form dashboard chat. No optimistic local append here — the server
  // persists the user's own message and pushes it back over the socket
  // immediately (see companionService.sendUserMessage), so every open
  // tab/device for this account picks it up the same way, instead of this
  // tab showing a message the others don't know about yet.
  const sendChat = useCallback(async (text) => {
    await api.post("/api/assistant/chat", { text });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  return (
    <CompanionContext.Provider value={{ messages, leadAlerts, toast, reply, sendChat, dismissToast }}>
      {children}
    </CompanionContext.Provider>
  );
}

export function useCompanion() {
  return useContext(CompanionContext);
}
