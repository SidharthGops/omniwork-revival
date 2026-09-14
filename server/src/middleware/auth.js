import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    req.teamId = payload.team;
    req.role = payload.role;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Gate a route to a specific role (currently just "lead"). Used for the
// team-lead-only view of who's flagged themselves blocked.
export function requireRole(role) {
  return (req, res, next) => {
    if (req.role !== role) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
