import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Cafeteria from "./pages/Cafeteria";

function Protected({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1>Companion</h1>
        {user && (
          <div className="nav-links">
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/cafeteria">Cafeteria</NavLink>
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>
              Sign out
            </a>
          </div>
        )}
      </div>

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
