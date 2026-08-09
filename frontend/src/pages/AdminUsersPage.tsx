import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { IconSearch, IconUsers } from "../components/Icons";
import { StatusBadge } from "../components/StatusBadge";
import { adminApi, ApiError } from "../lib/api";
import type { AdminUser, UserLifecycleStatus } from "../lib/types";

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "locked", label: "Locked" },
  { value: "inactive", label: "Inactive" },
];

export function AdminUsersPage() {
  const [params, setParams] = useSearchParams();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState(params.get("q") || "");
  const status = params.get("status") || "all";

  const load = useCallback(async () => {
    setError("");
    try {
      const qs = new URLSearchParams();
      if (status && status !== "all") qs.set("status", status);
      if (q.trim()) qs.set("q", q.trim());
      const data = await adminApi.get<{ results: AdminUser[] }>(
        `/api/admin/users?${qs.toString()}`,
      );
      setUsers(data.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users");
    }
  }, [q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (q.trim()) next.set("q", q.trim());
    else next.delete("q");
    setParams(next);
  }

  function setStatusFilter(value: string) {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete("status");
    else next.set("status", value);
    setParams(next);
  }

  return (
    <div className="stack-lg">
      <section className="page-hero">
        <h1>Users</h1>
        <p className="page-lead">
          Pending means signed up without biometric onboarding. Active means a
          real, usable vault account.
        </p>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <form className="filter-bar" onSubmit={onSearch}>
        <div className="search-field">
          <IconSearch aria-hidden />
          <input
            id="admin-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email or name"
            aria-label="Search users"
          />
        </div>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
      </form>

      <div className="chip-row" style={{ marginTop: "-0.5rem" }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`chip${status === f.value ? " is-active" : ""}`}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!users.length ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconUsers aria-hidden />
          </div>
          <h3>No users match</h3>
          <p>Try another status filter or clear the search.</p>
        </div>
      ) : (
        <div className="user-list">
          {users.map((u) => (
            <article key={u.id} className="user-card">
              <div className="name-cell">
                <Avatar label={u.name || u.email} size={2.4} />
                <div>
                  <Link className="link-inline" to={`/admin/users/${u.id}`}>
                    {u.name}
                  </Link>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {u.email}
                  </div>
                  <div className="user-card-stats">
                    <span>{u.credential_count} credentials</span>
                    <span>2FA {u.two_factor_enabled ? "on" : "off"}</span>
                    <span>Bio {u.biometric_enabled ? "on" : "off"}</span>
                    <span>Joined {new Date(u.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <StatusBadge
                  status={u.status as UserLifecycleStatus}
                  isStaff={u.is_staff}
                />
                <Link className="btn btn-secondary btn-sm" to={`/admin/users/${u.id}`}>
                  Open
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
