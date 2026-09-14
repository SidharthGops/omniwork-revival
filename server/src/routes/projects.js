import { Router } from "express";
import Project from "../models/Project.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { generateChecklist, draftCheckIn } from "../services/aiOrchestrator.js";
import { sendCompanionMessage } from "../services/companionService.js";

const router = Router();
router.use(requireAuth);

// List all projects for the caller's team.
router.get("/", async (req, res) => {
  const projects = await Project.find({ team: req.teamId }).populate(
    "tasks.assignee",
    "name"
  );
  res.json(projects);
});

// Create a project and have the AI orchestrator break it into a task checklist.
router.post("/", async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });

  const checklistTitles = await generateChecklist(title, description || "");

  const project = await Project.create({
    title,
    description,
    team: req.teamId,
    createdBy: req.userId,
    tasks: checklistTitles.map((t) => ({ title: t })),
  });

  res.status(201).json(project);
});

// Update a single task's status and/or assignee (drives the checklist UI,
// the presence view, and the companion scheduler's due-for-check-in scan).
router.patch("/:projectId/tasks/:taskId", async (req, res) => {
  const { status, assignee } = req.body;
  const project = await Project.findOne({
    _id: req.params.projectId,
    team: req.teamId,
  });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const task = project.tasks.id(req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });

  if (status) task.status = status;

  // "assignee" is treated as present-but-empty (null/"") when the caller
  // wants to unassign, vs. simply omitted when they're only changing status.
  if (assignee !== undefined) {
    if (!assignee) {
      task.assignee = undefined;
    } else {
      // Re-validate server-side that the assignee is actually on this team —
      // never trust an id the client sends as-is, even from a same-team
      // dropdown, since nothing stops a crafted request otherwise.
      const member = await User.findOne({ _id: assignee, team: req.teamId }).select("_id");
      if (!member) return res.status(400).json({ error: "Assignee must be a member of your team" });
      task.assignee = member._id;
    }
  }

  await project.save();
  await project.populate("tasks.assignee", "name");
  res.json(project);
});

// Force an AI check-in on a task right now, bypassing the scheduler's
// threshold. Delivered through the same companion pipeline as proactive
// check-ins (persisted + pushed over the /companion socket + optional Slack
// DM), so "ask for a check-in" and "get proactively checked in on" are one
// unified feed instead of two different UI patterns.
router.post("/:projectId/tasks/:taskId/check-in", async (req, res) => {
  const project = await Project.findOne({
    _id: req.params.projectId,
    team: req.teamId,
  });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const task = project.tasks.id(req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const message = await draftCheckIn(task.title, task.lastUpdateNote || task.status);
  task.lastCheckInAt = new Date();
  await project.save();

  const targetUserId = (task.assignee || req.userId).toString();
  await sendCompanionMessage(req.app.get("io"), {
    userId: targetUserId,
    text: message,
    kind: "checkin",
    meta: {
      projectId: project._id.toString(),
      taskId: task._id.toString(),
      taskTitle: task.title,
      manual: true,
    },
  });

  res.json({ message });
});

export default router;
