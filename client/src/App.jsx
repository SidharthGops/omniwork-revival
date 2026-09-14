import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ProjectManagement from "./pages/ProjectManagement";
import Cafeteria from "./pages/Cafeteria";
import CompanionToast from "./components/CompanionToast";
import PresenceSwitcher from "./components/PresenceSwitcher";

function Protected({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      {user && <CompanionToast />}
      <div className="top-bar">
        <h1>Companion</h1>
        {user && (
          <div className="nav-links">
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/projects">Projects</NavLink>
            <NavLink to="/cafeteria">Cafeteria</NavLink>
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>
              Sign out
            </a>
          </div>
        )}
      </div>

      {/* Persistent across every page, per the redesign — status is never
          tucked away in just the Dashboard anymore. */}
      {user && (
        <div className="top-status-bar">
          <span className="top-status-label">Your status</span>
          <PresenceSwitcher initialStatus={user.presence?.status} />
        </div>
      )}

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/projects"
          element={
            <Protected>
              <ProjectManagement />
            </Protected>
          }
        />
        <Route
          path="/cafeteria"
          element={
            <Protected>
              <Cafeteria />
            </Protected>
          }
        />
      </Routes>
    </div>
  );
}
