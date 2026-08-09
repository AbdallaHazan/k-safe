import type { ReactNode } from "react";
import { IconChevronDown } from "./Icons";

export function SettingRow({
  icon,
  title,
  description,
  status,
  open,
  onToggle,
  actionLabel,
  actionTone = "default",
  hideToggle = false,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  open: boolean;
  onToggle: () => void;
  actionLabel: string;
  actionTone?: "default" | "primary" | "danger";
  hideToggle?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`setting-row${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="setting-row-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        {icon ? <span className="setting-row-icon">{icon}</span> : null}
        <div className="setting-row-body-inner">
          <h3>{title}</h3>
          {description ? <p className="muted">{description}</p> : null}
        </div>
        <div className="setting-row-actions">
          {status}
          {!hideToggle ? (
            <span
              className={`setting-row-toggle${
                actionTone === "primary" ? " is-active" : ""
              }${actionTone === "danger" ? " is-danger" : ""}`}
              aria-hidden
            >
              {open ? "Close" : actionLabel}
            </span>
          ) : null}
          <IconChevronDown className="setting-row-chevron" aria-hidden />
        </div>
      </button>
      {open && children ? (
        <div className="setting-row-body">
          <div className="setting-row-body-content stack">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
