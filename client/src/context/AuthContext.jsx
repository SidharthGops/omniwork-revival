import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

// sessionStorage, not localStorage: localStorage is shared by every tab of
// the same browser/origin, so signing into a second account in a second tab
// silently overwrote the first tab's session (and only showed up after a
// refresh, since the first tab's React state doesn't re-read storage on its
// own). sessionStorage is scoped per tab, so two tabs can hold two different
// logged-in accounts at once, which is what "open two tabs, two accounts"
// actually needs.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem("token"));

  useEffect(() => {
    const savedUser = sessionStorage.getItem("user");
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  async function login(email, password) {
    const { data } = await api.post("/api/auth/login", { email, password });
    sessionStorage.setItem("token", data.token);
    sessionStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
