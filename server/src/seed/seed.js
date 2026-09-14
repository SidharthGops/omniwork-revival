import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import KnowledgeEntry from "../models/KnowledgeEntry.js";
import { embed } from "../services/vectorStore.js";

async function run() {
  await connectDB();

  await Promise.all([
    User.deleteMany({}),
    Team.deleteMany({}),
    Project.deleteMany({}),
    KnowledgeEntry.deleteMany({}),
  ]);

  const team = await Team.create({ name: "Product Engineering" });

  const passwordHash = await bcrypt.hash("password123", 10);
  const [lead, alex, priya] = await User.create([
    { name: "Sidharth (Lead)", email: "lead@demo.dev", passwordHash, team: team._id, role: "lead" },
    { name: "Alex", email: "alex@demo.dev", passwordHash, team: team._id, role: "member" },
    { name: "Priya", email: "priya@demo.dev", passwordHash, team: team._id, role: "member" },
  ]);

  team.members = [lead._id, alex._id, priya._id];
  await team.save();

  await Project.create({
    title: "Customer analytics dashboard",
    description: "Internal dashboard showing signups, activation and retention.",
    team: team._id,
    createdBy: lead._id,
    tasks: [
      { title: "Set up database", status: "done", assignee: alex._id },
      { title: "Build data pipeline", status: "in_progress", assignee: alex._id },
      { title: "Create analytics API", status: "todo" },
      { title: "Build dashboard UI", status: "todo", assignee: priya._id },
      { title: "Test and deploy", status: "todo" },
    ],
  });

  const knowledgeSeed = [
    {
      title: "Auth token refresh loop",
      problem: "JWT refresh keeps firing repeatedly and logs the user out under load",
      solution: "Debounce the refresh call and store the in-flight promise so parallel requests share it.",
      solvedBy: alex._id,
    },
    {
      title: "Socket.io reconnect storm",
      problem: "Clients reconnect and rejoin rooms multiple times after a network blip",
      solution: "Track joined rooms client-side and no-op rejoin if already a member; add reconnection backoff.",
      solvedBy: priya._id,
    },
    {
      title: "Slow analytics query",
      problem: "Dashboard query times out on large date ranges",
      solution: "Added a composite index on (team_id, created_at) and pre-aggregate daily rollups.",
      solvedBy: lead._id,
    },
  ];

  await KnowledgeEntry.create(
    knowledgeSeed.map((k) => ({
      team: team._id,
      title: k.title,
      problem: k.problem,
      solution: k.solution,
      solvedBy: k.solvedBy,
      embedding: embed(`${k.title} ${k.problem} ${k.solution}`),
    }))
  );

  console.log("[seed] done. Demo logins (password: password123):");
  console.log("  lead@demo.dev / alex@demo.dev / priya@demo.dev");
  process.exit(0);
}

run().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
