import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import PresenceSwitcher from "../components/PresenceSwitcher";
import TeammatePresence from "../components/TeammatePresence";
import ProjectChecklist from "../components/ProjectChecklist";
import StuckAssist from "../components/StuckAssist";

export default function Dashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get("/api/projects").then((res) => setProjects(res.data));
  }, []);

  function updateProject(updated) {
    setProjects((prev) =>
      prev.map((p) => (p._id === updated._id ? updated : p))
    );
  }

  async function createProject(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post("/api/projects", {
        title: newTitle,
        description: newDescription,
      });
      setProjects((prev) => [data, ...prev]);
      setNewTitle("");
      setNewDescription("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="panel">
        <h2>Your status</h2>
        <PresenceSwitcher initialStatus={user?.presence?.status} />
      </div>

      <TeammatePresence />

      <div className="panel">
        <h2>New project</h2>
        <form onSubmit={createProject}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Build customer analytics dashboard"
            />
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={2}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </div>
          <button type="submit" disabled={creating}>
            {creating ? "Generating checklist..." : "Create + generate checklist"}
          </button>
        </form>
      </div>

      {projects.map((project) => (
        <ProjectChecklist
          key={project._id}
          project={project}
          onChange={updateProject}
        />
      ))}

      <StuckAssist />
    </div>
  );
}
