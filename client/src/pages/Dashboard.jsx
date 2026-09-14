import CompanionPanel from "../components/CompanionPanel";
import TeammatePresence from "../components/TeammatePresence";

// Dashboard is intentionally minimal: the AI assistant chat (which a lead
// can also use to ping a specific teammate) and live team status. Project
// creation, checklists, task assignment, and team alerts all moved to
// Project Management.
export default function Dashboard() {
  return (
    <div>
      <CompanionPanel />
      <TeammatePresence />
    </div>
  );
}
