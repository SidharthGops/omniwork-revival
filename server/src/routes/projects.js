import { Router } from "express";
import Project from "../models/Project.js";
import { requireAuth } from "../middleware/auth.js";
import { generateChecklist, draftCheckIn } from "../services/aiOrchestrator.js";

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

// Update a single task's status (drives the checklist UI + presence view).
router.patch("/:projectId/tasks/:taskId", async (req, res) => {
  const { status } = req.body;
  const project = await Project.findOne({
    _id: req.params.projectId,
    team: req.teamId,
  });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const task = project.tasks.id(req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });

  if (status) task.status = status;
  await project.save();
  res.json(project);
});

// AI-drafted check-in message for a task — the async, non-intrusive nudge.
router.get("/:projectId/tasks/:taskId/check-in", async (req, res) => {
  const project = await Project.findOne({
    _id: req.params.projectId,
    team: req.teamId,
  });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const task = project.tasks.id(req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const message = await draftCheckIn(task.title, task.status);
  res.json({ message });
});

export default router;
