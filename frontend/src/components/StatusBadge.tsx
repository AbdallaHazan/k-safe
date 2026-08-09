import type { UserLifecycleStatus } from "../lib/types";

const LABELS: Record<UserLifecycleStatus, string> = {
  pending: "Pending",
  active: "Active",
  locked: "Locked",
  inactive: "Inactive",
};

export function StatusBadge({
  status,
  isStaff,
}: {
  status: UserLifecycleStatus;
  isStaff?: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", gap: "0.35rem", flexWrap: "wrap" }}>
      <span className={`badge status-${status}`}>{LABELS[status]}</span>
      {isStaff ? <span className="badge status-staff">Staff</span> : null}
    </span>
  );
}
