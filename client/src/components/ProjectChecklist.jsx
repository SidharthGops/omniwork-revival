import { useState } from "react";
import { api } from "../api/client";

const STATUS_CYCLE = { todo: "in_progress", in_progress: "done", done: "todo" };

export default function ProjectChecklist({ project, members = [], onChange }) {
  const [nudging, setNudging] = useState(null);
  const [nudged, setNudged] = useState(null);

  async function cycleStatus(task) {
    const nextStatus = STATUS_CYCLE[task.status];
    const { data } = await api.patch(
      `/api/projects/${project._id}/tasks/${task._id}`,
      { status: nextStatus }
    );
    onChange(data);
  }

  // Assign/reassign a task to a teammate — the server re-validates that the
  // chosen id is actually on this team, so this can't be used to hand a
  // task to an outsider even if the dropdown were ever tampered with.
  async function reassign(task, memberId) {
    const { data } = await api.patch(
      `/api/projects/${project._id}/tasks/${task._id}`,
      { assignee: memberId || null }
    );
    onChange(data);
  }

  // Forces an AI check-in on this task right now. The message shows up in
  // the "AI assistant" chat on the Dashboard (and as a toast) rather than
  // here — this button and the proactive scheduler both feed the same channel.
  async function requestCheckIn(task) {
    setNudging(task._id);
    try {
      await api.post(`/api/projects/${project._id}/tasks/${task._id}/check-in`);
      setNudged(task._id);
      setTimeout(() => setNudged(null), 2500);
    } finally {
      setNudging(null);
    }
  }

  return (
    <div className="panel">
      <h2>{project.title}</h2>
      {project.tasks.map((task) => (
        <div key={task._id} className="task-row">
          <span>{task.title}</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {nudged === task._id && (
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                Sent — check the AI assistant chat
              </span>
            )}
            <select
              className="assignee-select"
              value={task.assignee?._id || task.assignee || ""}
              onChange={(e) => reassign(task, e.target.value)}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button className="task-status" onClick={() => cycleStatus(task)}>
              {task.status.replace("_", " ")}
            </button>
            {task.status === "in_progress" && (
              <button
                className="secondary"
                disabled={nudging === task._id}
                onClick={() => requestCheckIn(task)}
              >
                {nudging === task._id ? "Nudging..." : "Check in"}
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
