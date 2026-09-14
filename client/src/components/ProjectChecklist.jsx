import { useState } from "react";
import { api } from "../api/client";

const STATUS_CYCLE = { todo: "in_progress", in_progress: "done", done: "todo" };

export default function ProjectChecklist({ project, onChange }) {
  const [checkInFor, setCheckInFor] = useState(null);
  const [checkInMessage, setCheckInMessage] = useState("");

  async function cycleStatus(task) {
    const nextStatus = STATUS_CYCLE[task.status];
    const { data } = await api.patch(
      `/api/projects/${project._id}/tasks/${task._id}`,
      { status: nextStatus }
    );
    onChange(data);
  }

  async function requestCheckIn(task) {
    setCheckInFor(task._id);
    setCheckInMessage("Thinking...");
    const { data } = await api.get(
      `/api/projects/${project._id}/tasks/${task._id}/check-in`
    );
    setCheckInMessage(data.message);
  }

  return (
    <div className="panel">
      <h2>{project.title}</h2>
      {project.tasks.map((task) => (
        <div key={task._id}>
          <div className="task-row">
            <span>{task.title}</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="task-status" onClick={() => cycleStatus(task)}>
                {task.status.replace("_", " ")}
              </button>
              <button className="secondary" onClick={() => requestCheckIn(task)}>
                Check in
              </button>
            </span>
          </div>
          {checkInFor === task._id && (
            <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 8px" }}>
              {checkInMessage}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
