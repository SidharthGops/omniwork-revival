// The proactive half of "Understand work without interrupting work."
//
// A recurring scan (not a per-request handler) looks at every in-progress
// task, and for each one decides whether the AI should check in — based on
// how long it's been since the last touch, and without ever interrupting
// someone who has explicitly signalled they don't want it right now
// (Focused / Away), or who's already mid-flow with a Blocked alert, or
// who's in a Zoom meeting if Zoom is connected.
//
// This intentionally runs as a plain interval rather than a cron library —
// zero new dependencies, and "scan every N minutes" is all this needs.

import Project from "../models/Project.js";
import User from "../models/User.js";
import { draftCheckIn } from "./aiOrchestrator.js";
import { sendCompanionMessage } from "./companionService.js";
import { notifySlackDM } from "./slack.js";
import { isInZoomMeeting } from "./zoom.js";

const CHECKIN_THRESHOLD_MS = Number(process.env.COMPANION_CHECKIN_THRESHOLD_MS || 30 * 60 * 1000);
const SCAN_INTERVAL_MS = Number(process.env.COMPANION_SCAN_INTERVAL_MS || 5 * 60 * 1000);

// Presence states the companion should never interrupt proactively.
const DO_NOT_DISTURB = new Set(["focused", "away"]);

// Guards against overlapping scans: if a scan is slow (a hung Ollama call, a
// slow Zoom API round trip — neither of which has a timeout), the next
// setInterval tick would otherwise start a second scan on top of the first,
// and a task sitting right at the check-in threshold could get double-sent.
let scanning = false;

export function startCompanionScheduler(io) {
  const timer = setInterval(() => runGuarded(io), SCAN_INTERVAL_MS);
  timer.unref?.(); // don't keep the process alive just for this in tests/scripts

  // Also run shortly after boot so a demo doesn't have to wait a full interval.
  setTimeout(() => runGuarded(io), 15_000);

  return timer;
}

function runGuarded(io) {
  if (scanning) {
    console.warn("[companion] previous scan still running — skipping this tick");
    return;
  }
  scanning = true;
  runScan(io)
    .catch((err) => console.error("[companion] scan failed:", err))
    .finally(() => {
      scanning = false;
    });
}

async function runScan(io) {
  const projects = await Project.find({ "tasks.status": "in_progress" });
  const now = Date.now();

  // Batch-load every assignee once per scan instead of once per task
  // (the old version ran one User.findById per in-progress task, so a
  // teammate with several open tasks triggered redundant lookups every
  // tick), and cache each user's Zoom "in a meeting" check per scan so one
  // person's Zoom status is only fetched once no matter how many of their
  // tasks are in progress.
  const assigneeIds = new Set();
  for (const project of projects) {
    for (const task of project.tasks) {
      if (task.status === "in_progress" && task.assignee) assigneeIds.add(task.assignee.toString());
    }
  }

  const users = await User.find({ _id: { $in: [...assigneeIds] } });
  const usersById = new Map(users.map((u) => [u._id.toString(), u]));
  const zoomCache = new Map();

  async function isBusyOnZoom(user) {
    if (!user.zoomEmail) return false;
    if (zoomCache.has(user.zoomEmail)) return zoomCache.get(user.zoomEmail);
    const busy = await isInZoomMeeting(user.zoomEmail).catch(() => false);
    zoomCache.set(user.zoomEmail, busy);
    return busy;
  }

  for (const project of projects) {
    let changed = false;

    for (const task of project.tasks) {
      if (task.status !== "in_progress" || !task.assignee) continue;

      const lastTouch = task.lastCheckInAt || task.updatedAt || task.createdAt;
      if (now - new Date(lastTouch).getTime() < CHECKIN_THRESHOLD_MS) continue;

      const user = usersById.get(task.assignee.toString());
      if (!user) continue;
      if (DO_NOT_DISTURB.has(user.presence?.status)) continue;
      if (user.presence?.status === "blocked") continue; // already being handled by the blocked flow
      if (await isBusyOnZoom(user)) continue;

      const message = await draftCheckIn(task.title, task.lastUpdateNote || task.status);

      await sendCompanionMessage(io, {
        userId: user._id.toString(),
        text: message,
        kind: "checkin",
        meta: {
          projectId: project._id.toString(),
          taskId: task._id.toString(),
          taskTitle: task.title,
        },
      });

      task.lastCheckInAt = new Date();
      changed = true;

      if (user.slackUserId) {
        notifySlackDM(user.slackUserId, `👋 ${message}`).catch(() => {});
      }
    }

    if (changed) await project.save();
  }
}
