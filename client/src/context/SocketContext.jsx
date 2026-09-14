import { createContext, useContext, useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

// Two socket namespaces: /presence for status broadcasts, /rooms for cafeteria chat.
export function SocketProvider({ children }) {
  const { token } = useAuth();
  const baseURL = import.meta.env.VITE_API_URL || "http://localhost:4000";

  const sockets = useMemo(() => {
    if (!token) return null;
    return {
      presence: io(`${baseURL}/presence`, { auth: { token } }),
      rooms: io(`${baseURL}/rooms`, { auth: { token } }),
    };
  }, [token, baseURL]);

  useEffect(() => {
    return () => {
      sockets?.presence.disconnect();
      sockets?.rooms.disconnect();
    };
  }, [sockets]);

  return (
    <SocketContext.Provider value={sockets}>{children}</SocketContext.Provider>
  );
}

export function useSockets() {
  return useContext(SocketContext);
}
