import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { CompanionProvider } from "./context/CompanionContext";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          {/* Was missing entirely before — every component reading
              useCompanion() (CompanionPanel, CompanionToast, TeamLeadAlerts)
              got `null` from the context's default value, so the whole
              AI-companion feed, proactive check-ins, and blocked-teammate
              alerts silently rendered nothing no matter what the backend
              sent. This is the fix. */}
          <CompanionProvider>
            <App />
          </CompanionProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
