import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconUsers } from "../components/Icons";
import { adminApi, ApiError } from "../lib/api";
import type { AdminStats } from "../lib/types";

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adminApi.get<AdminStats>("/api/admin/stats");
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load stats");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stack-lg">
      <section className="page-hero">
        <h1>System overview</h1>
        <p className="page-lead">
          Pending users registered but have not finished biometric setup — they are
          not treated as real users yet.
        </p>
        <div className="page-hero-actions">
          <Link className="btn btn-secondary" to="/admin/users?status=pending">
            <IconUsers aria-hidden />
            View pending users
          </Link>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      {stats ? (
        <>
          <div className="stat-grid" style={{ margin: 0 }}>
            <div className="stat">
              <div className="muted">Total users</div>
              <strong>{stats.users_total}</strong>
            </div>
            <div className="stat">
              <div className="muted">Pending</div>
              <strong style={{ color: "#92600a" }}>{stats.users_pending}</strong>
            </div>
            <div className="stat">
              <div className="muted">Active (real)</div>
              <strong style={{ color: "#0d6b3c" }}>{stats.users_active}</strong>
            </div>
            <div className="stat">
              <div className="muted">Locked</div>
              <strong style={{ color: "#9c1626" }}>{stats.users_locked}</strong>
            </div>
            <div className="stat">
              <div className="muted">Inactive</div>
              <strong>{stats.users_inactive}</strong>
            </div>
          </div>

          <div className="split-panels">
            <section className="panel-section">
              <div className="panel-section-head">
                <h2>Recent failed logins</h2>
              </div>
              {stats.recent_failed_logins.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No recent failures.
                </p>
              ) : (
                <div className="timeline">
                  {stats.recent_failed_logins.map((row) => (
                    <div key={row.id} className="timeline-item">
                      <span className="timeline-dot" aria-hidden />
                      <div className="timeline-body">
                        <strong>{row.user_email}</strong>
                        <span>
                          {row.failure_reason || "failed"} · {row.ip_address || "—"} ·{" "}
                          {new Date(row.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel-section">
              <div className="panel-section-head">
                <h2>Recent security events</h2>
              </div>
              {stats.recent_security_logs.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No events yet.
                </p>
              ) : (
                <div className="timeline">
                  {stats.recent_security_logs.map((log) => (
                    <div key={log.id} className="timeline-item">
                      <span className="timeline-dot" aria-hidden />
                      <div className="timeline-body">
                        <strong>{log.action.replaceAll("_", " ")}</strong>
                        <span>
                          {log.user_email || "system"} · {log.ip_address || "—"} ·{" "}
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      ) : !error ? (
        <p className="muted">Loading…</p>
      ) : null}
    </div>
  );
}
