import { useEffect } from "react";
import { useCompanion } from "../context/CompanionContext";

// Mounted once, globally, in App.jsx — this is what makes the AI feel
// proactive: a check-in or blocked-alert can land while the user is in the
// Cafeteria, not just when they happen to be looking at the companion panel.
export default function CompanionToast() {
  const companion = useCompanion();
  const toast = companion?.toast;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => companion.dismissToast(), 7000);
    return () => clearTimeout(timer);
  }, [toast, companion]);

  if (!toast) return null;

  return (
    <div className="companion-toast" role="status">
      <span className="companion-toast-label">{toast.authorLabel}</span>
      <p>{toast.text}</p>
      <button className="companion-toast-close" onClick={() => companion.dismissToast()} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
