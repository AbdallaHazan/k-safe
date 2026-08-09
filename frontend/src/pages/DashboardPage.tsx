import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import {
  IconClock,
  IconFolder,
  IconShield,
  IconVault,
} from "../components/Icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { DashboardStats } from "../lib/types";

export function DashboardPage() {
  const { decrypt, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<DashboardStats>("/api/dashboard");
        if (cancelled) return;
        setStats(data);
        const map: Record<string, string> = {};
        await Promise.all(
          data.recent_credentials.map(async (c) => {
            try {
              map[c.id] = await decrypt(c.encrypted_title);
            } catch {
              map[c.id] = "••••";
            }
          }),
        );
        if (!cancelled) setTitles(map);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [decrypt]);

  return (
    <div className="stack-lg">
      <section className="page-hero">
        <h1>Hello, {stats?.welcome_name ?? user?.name ?? "there"}</h1>
        <p className="page-lead">
          Your encrypted workspace at a glance — credentials, categories, and
          recent security activity.
        </p>
        <div className="page-hero-actions">
          <Link className="btn btn-primary" to="/app/vault">
            <IconVault aria-hidden />
            Open vault
          </Link>
          <Link className="btn btn-secondary" to="/app/security">
            <IconShield aria-hidden />
            Review security
          </Link>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="metric-strip">
        <div className="metric-card">
          <div className="metric-icon">
            <IconVault aria-hidden />
          </div>
          <div>
            <strong>{stats?.total_accounts ?? "—"}</strong>
            <span>Credentials</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon">
            <IconFolder aria-hidden />
          </div>
          <div>
            <strong>{stats?.total_categories ?? "—"}</strong>
            <span>Categories</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon">
            <IconShield aria-hidden />
          </div>
          <div>
            <strong>{stats?.security_score ?? "—"}</strong>
            <span>Security score</span>
          </div>
        </div>
      </div>

      <div className="split-panels">
        <section className="panel-section">
          <div className="panel-section-head">
            <h2>Recent credentials</h2>
            <Link className="link-inline" to="/app/vault">
              View all
            </Link>
          </div>
          {!stats?.recent_credentials.length ? (
            <div className="empty-state" style={{ padding: "1.75rem 1rem" }}>
              <h3>Nothing here yet</h3>
              <p>Add your first credential to populate this list.</p>
              <Link className="btn btn-primary btn-sm" to="/app/vault">
                Go to vault
              </Link>
            </div>
          ) : (
            <div className="mini-list">
              {stats.recent_credentials.map((c) => (
                <Link key={c.id} className="mini-item" to="/app/vault">
                  <Avatar label={titles[c.id] ?? "?"} size={2} />
                  <div style={{ minWidth: 0 }}>
                    <strong>{titles[c.id] ?? "…"}</strong>
                    <span>
                      {c.website_host || "No website"} ·{" "}
                      {new Date(c.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel-section">
          <div className="panel-section-head">
            <h2>Recent activity</h2>
            <IconClock aria-hidden style={{ width: 18, height: 18, color: "var(--ink-muted)" }} />
          </div>
          {!stats?.recent_activity.length ? (
            <div className="empty-state" style={{ padding: "1.75rem 1rem" }}>
              <h3>No activity yet</h3>
              <p>Logins, reveals, and vault changes will show up here.</p>
            </div>
          ) : (
            <div className="timeline">
              {stats.recent_activity.map((a) => (
                <div key={a.id} className="timeline-item">
                  <span className="timeline-dot" aria-hidden />
                  <div className="timeline-body">
                    <strong>{a.action.replaceAll("_", " ")}</strong>
                    <span>{new Date(a.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
