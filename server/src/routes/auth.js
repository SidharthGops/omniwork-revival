import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = Router();

// Simplified for hackathon speed: no signup flow, no email verification.
// Demo users are created by the seed script; this just checks password + issues a JWT.
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() });
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await bcrypt.compare(password || "", user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const token = jwt.sign(
    { sub: user._id.toString(), team: user.team?.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      team: user.team,
      presence: user.presence,
    },
  });
});

export default router;
