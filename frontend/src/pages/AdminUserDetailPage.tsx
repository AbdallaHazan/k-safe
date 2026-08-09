import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { adminApi, ApiError } from "../lib/api";
import type { AdminUser, UserLifecycleStatus } from "../lib/types";

export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setError("");
    try {
      const data = await adminApi.get<AdminUser>(`/api/admin/users/${userId}`);
      setUser(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load user");
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: string, body?: Record<string, unknown>) {
    if (!userId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await adminApi.post<
        { detail?: string; user?: AdminUser } & AdminUser
      >(
        `/api/admin/users/${userId}/${action}`,
        body ?? {},
      );
      if ("status" in res && typeof res.status === "string") {
        setUser(res as AdminUser);
      } else if (res.user) {
        setUser(res.user);
        if (res.detail) setMessage(res.detail);
      } else if (res.detail) {
        setMessage(res.detail);
        await load();
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (!userId || !user) return;
    if (
      !window.confirm(
        `Delete ${user.email}? This removes their vault ciphertext permanently.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await adminApi.delete(`/api/admin/users/${userId}`);
      navigate("/admin/users", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  if (!user && !error) {
    return (
      <div className="panel">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="panel stack">
        <div className="error-banner">{error}</div>
        <Link className="link-inline" to="/admin/users">
          Back to users
        </Link>
      </div>
    );
  }

  return (
    <div className="panel stack" style={{ gap: "1.35rem" }}>
      <div>
        <Link className="link-inline" to="/admin/users">
          ← Users
        </Link>
        <h1 style={{ marginTop: "0.5rem" }}>{user.name}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {user.email}
        </p>
        <div style={{ marginTop: "0.75rem" }}>
          <StatusBadge
            status={user.status as UserLifecycleStatus}
            isStaff={user.is_staff}
          />
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <div className="stat-grid">
        <div className="stat">
          <div className="muted">Credentials</div>
          <strong>{user.credential_count}</strong>
        </div>
        <div className="stat">
          <div className="muted">Categories</div>
          <strong>{user.category_count}</strong>
        </div>
        <div className="stat">
          <div className="muted">Email 2FA</div>
          <strong>{user.two_factor_enabled ? "On" : "Off"}</strong>
        </div>
        <div className="stat">
          <div className="muted">Biometric</div>
          <strong>{user.biometric_enabled ? "On" : "Off"}</strong>
        </div>
        <div className="stat">
          <div className="muted">Failed logins</div>
          <strong>{user.failed_login_attempts}</strong>
        </div>
        <div className="stat">
          <div className="muted">Last login</div>
          <strong style={{ fontSize: "1rem" }}>
            {user.last_login_at
              ? new Date(user.last_login_at).toLocaleString()
              : "Never"}
          </strong>
        </div>
      </div>

      <section className="stack">
        <h2>Account controls</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {user.is_active ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => void runAction("deactivate")}
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void runAction("activate")}
            >
              Activate
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void runAction("unlock")}
          >
            Unlock lockout
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void runAction("force-logout")}
          >
            Force logout
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void runAction("reset-onboarding")}
          >
            Reset to pending
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => void deleteUser()}
          >
            Delete user
          </button>
        </div>
        <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
          Reset to pending clears biometric enrollment so the account shows as
          Pending again. Vault ciphertext is never readable here.
        </p>
      </section>

      <section className="stack">
        <h2>Recent login history</h2>
        {!user.login_history?.length ? (
          <p className="muted">No history.</p>
        ) : (
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Result</th>
                <th>Reason</th>
                <th>IP</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {user.login_history.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className={`badge ${row.success ? "strong" : "weak"}`}>
                      {row.success ? "OK" : "Fail"}
                    </span>
                  </td>
                  <td>{row.failure_reason || "—"}</td>
                  <td>{row.ip_address || "—"}</td>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
