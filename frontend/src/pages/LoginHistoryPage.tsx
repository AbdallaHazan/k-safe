import { useEffect, useState } from "react";
import { api } from "../lib/api";

type LoginRow = {
  id: string;
  ip_address: string | null;
  user_agent: string;
  success: boolean;
  failure_reason: string;
  created_at: string;
};

export function LoginHistoryPage() {
  const [rows, setRows] = useState<LoginRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<LoginRow[]>("/api/login-history");
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load history");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="panel stack-lg">
      <div className="page-head">
        <div>
          <h1>Login history</h1>
          <p className="page-lead">Recent sign-in attempts for your account.</p>
        </div>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      {!rows.length ? (
        <div className="empty">No login events yet.</div>
      ) : (
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Result</th>
              <th>IP</th>
              <th>Reason</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className={`badge ${row.success ? "strong" : "weak"}`}>
                    {row.success ? "Success" : "Failed"}
                  </span>
                </td>
                <td className="muted">{row.ip_address ?? "—"}</td>
                <td className="muted">{row.failure_reason || "—"}</td>
                <td className="muted">
                  {new Date(row.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
