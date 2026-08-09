import { NavLink, Outlet } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import { IconOverview, IconShield, IconUsers } from "./Icons";
import { setAdminTokens } from "../lib/api";

const links = [
  { to: "/admin", end: true, label: "Overview", icon: IconOverview },
  { to: "/admin/users", end: false, label: "Users", icon: IconUsers },
  { to: "/admin/security", end: false, label: "Security", icon: IconShield },
];

export function AdminLayout() {
  const profile = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("ks_admin_profile") || "{}") as {
        name?: string;
        email?: string;
      };
    } catch {
      return {};
    }
  })();

  function logout() {
    setAdminTokens(null);
    window.location.assign("/admin/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Admin navigation">
        <div className="brand">
          <BrandMark />
          KeySafe Admin
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
          <div className="user-name">{profile.name}</div>
          <div className="user-email">{profile.email}</div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: "0.9rem", width: "100%" }}
            onClick={logout}
          >
            Admin sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <nav className="mobile-nav" aria-label="Admin mobile navigation">
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
