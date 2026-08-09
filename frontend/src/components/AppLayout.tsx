import { NavLink, Outlet } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import {
  IconDashboard,
  IconFolder,
  IconSettings,
  IconShield,
  IconVault,
} from "./Icons";
import { useAuth } from "../lib/auth";

const links = [
  { to: "/app", end: true, label: "Dashboard", icon: IconDashboard },
  { to: "/app/vault", end: false, label: "Vault", icon: IconVault },
  { to: "/app/categories", end: false, label: "Categories", icon: IconFolder },
  { to: "/app/security", end: false, label: "Security", icon: IconShield },
  { to: "/app/settings", end: false, label: "Settings", icon: IconSettings },
];

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <BrandMark />
          KeySafe
        </div>
        <nav>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              <link.icon aria-hidden />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-name">{user?.name}</div>
          <div className="user-email">{user?.email}</div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: "0.9rem", width: "100%" }}
            onClick={() => void logout()}
          >
            Lock &amp; sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              <link.icon aria-hidden />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="main-inner">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
