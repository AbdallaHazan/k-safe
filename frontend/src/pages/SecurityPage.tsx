import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { decryptField, findReusedPasswords } from "../lib/crypto";
import type { CredentialListItem, SecurityScore } from "../lib/types";

type LogRow = {
  id: string;
  action: string;
  ip_address: string | null;
  timestamp: string;
  metadata: Record<string, unknown>;
};

export function SecurityPage() {
  const { getDek } = useAuth();
  const [score, setScore] = useState<SecurityScore | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [reused, setReused] = useState<
    { titles: string[]; ids: string[] }[]
  >([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, l, vault] = await Promise.all([
          api.get<SecurityScore>("/api/security-score"),
          api.get<LogRow[]>("/api/security-logs"),
          api.get<CredentialListItem[]>("/api/vault"),
        ]);
        if (cancelled) return;
        setScore(s);
        setLogs(l);

        const dek = getDek();
        const entries = await Promise.all(
          vault.map(async (item) => {
            const [title, password] = await Promise.all([
              decryptField(item.encrypted_title, dek),
              decryptField(item.encrypted_password, dek),
            ]);
            return { id: item.id, title, password };
          }),
        );
        if (!cancelled) {
          setReused(
            findReusedPasswords(entries).map(({ titles, ids }) => ({
              titles,
              ids,
            })),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load security data");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getDek]);

  return (
    <div className="stack-lg">
      <section className="page-hero">
        <h1>Security center</h1>
        <p className="page-lead">
          Account hygiene, reused passwords, and a live trail of sensitive actions.
        </p>
        <div className="page-hero-actions">
          <Link className="btn btn-secondary" to="/app/login-history">
            Login history
          </Link>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      {score ? (
        <section className="panel-section">
          <div className="row" style={{ alignItems: "flex-start", gap: "1.25rem" }}>
            <div
              className="score-ring"
              style={{ ["--score" as string]: score.score }}
              aria-label={`Security score ${score.score}`}
            >
              <span>{score.score}</span>
            </div>
            <div className="stack" style={{ flex: 1 }}>
              <div className="stat-grid" style={{ margin: 0 }}>
                <div className="stat">
                  <strong>{score.strong_passwords}</strong>
                  <span className="muted">Strong</span>
                </div>
                <div className="stat">
                  <strong>{score.medium_passwords}</strong>
                  <span className="muted">Medium</span>
                </div>
                <div className="stat">
                  <strong>{score.weak_passwords}</strong>
                  <span className="muted">Weak</span>
                </div>
                <div className="stat">
                  <strong>{score.two_factor_enabled ? "On" : "Off"}</strong>
                  <span className="muted">2FA</span>
                </div>
              </div>
              {score.deductions.length ? (
                <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {score.deductions.map((d) => (
                    <li key={d.code}>
                      {d.message} (−{d.penalty})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Looking solid. Keep rotating weak passwords.
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel-section">
        <div className="panel-section-head">
          <h2>Reused passwords</h2>
        </div>
        {!reused.length ? (
          <div className="empty-state" style={{ padding: "1.5rem 1rem" }}>
            <h3>No reuse detected</h3>
            <p>Great — no shared passwords across the unlocked vault.</p>
          </div>
        ) : (
          <div className="item-list">
            {reused.map((group) => (
              <div key={group.ids.join("-")} className="item-card" style={{ gridTemplateColumns: "1fr" }}>
                <div className="item-card-main">
                  <h3 className="item-card-title">Shared password</h3>
                  <div className="item-card-meta">
                    <span>Used on: {group.titles.join(", ")}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel-section">
        <div className="panel-section-head">
          <h2>Security log</h2>
        </div>
        {!logs.length ? (
          <div className="empty-state" style={{ padding: "1.5rem 1rem" }}>
            <h3>No events yet</h3>
            <p>Reveals, exports, and auth events will appear here.</p>
          </div>
        ) : (
          <div className="timeline">
            {logs.map((log) => (
              <div key={log.id} className="timeline-item">
                <span className="timeline-dot" aria-hidden />
                <div className="timeline-body">
                  <strong>{log.action.replaceAll("_", " ")}</strong>
                  <span>
                    {log.ip_address ?? "No IP"} ·{" "}
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
