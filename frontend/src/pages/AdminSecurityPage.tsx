import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminApi, ApiError } from "../lib/api";

type LogRow = {
  id: string;
  action: string;
  user_email: string | null;
  ip_address: string | null;
  user_agent: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function AdminSecurityPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [action, setAction] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const qs = new URLSearchParams();
      if (action.trim()) qs.set("action", action.trim());
      if (email.trim()) qs.set("email", email.trim());
      const data = await adminApi.get<{ results: LogRow[] }>(
        `/api/admin/security-logs?${qs.toString()}`,
      );
      setLogs(data.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load logs");
    }
  }, [action, email]);

  useEffect(() => {
    void load();
  }, [load]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  return (
    <div className="panel stack-lg">
      <div className="page-head">
        <div>
          <h1>Security logs</h1>
          <p className="page-lead">Platform-wide audit trail (no vault plaintext).</p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <form
        className="stack"
        onSubmit={onFilter}
        style={{ maxWidth: "28rem" }}
      >
        <div className="field">
          <label htmlFor="log-action">Action contains</label>
          <input
            id="log-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. login_failed"
          />
        </div>
        <div className="field">
          <label htmlFor="log-email">User email</label>
          <input
            id="log-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
      </form>

      <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Action</th>
            <th>User</th>
            <th>IP</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted">
                No logs.
              </td>
            </tr>
          ) : (
            logs.map((log) => (
              <tr key={log.id}>
                <td>
                  <code>{log.action}</code>
                </td>
                <td>{log.user_email || "—"}</td>
                <td>{log.ip_address || "—"}</td>
                <td>{new Date(log.created_at).toLocaleString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
