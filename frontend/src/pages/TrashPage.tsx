import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { IconTrash, IconVault } from "../components/Icons";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { decryptField } from "../lib/crypto";
import type { CredentialListItem } from "../lib/types";

type TrashRow = {
  id: string;
  title: string;
  websiteHost: string;
  deletedAt: string | null;
};

export function TrashPage() {
  const { getDek } = useAuth();
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await api.get<CredentialListItem[]>("/api/vault/trash");
      const dek = getDek();
      const decrypted = await Promise.all(
        list.map(async (item) => ({
          id: item.id,
          title: await decryptField(item.encrypted_title, dek),
          websiteHost: item.website_host,
          deletedAt: item.deleted_at ?? null,
        })),
      );
      setRows(decrypted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trash");
    } finally {
      setLoading(false);
    }
  }, [getDek]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(id: string) {
    try {
      await api.post(`/api/vault/${id}/restore`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Restore failed");
    }
  }

  async function purge(id: string) {
    if (!confirm("Permanently delete this credential?")) return;
    try {
      await api.delete(`/api/vault/${id}/purge`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Purge failed");
    }
  }

  return (
    <div className="stack-lg">
      <section className="page-hero">
        <h1>Trash</h1>
        <p className="page-lead">
          Soft-deleted credentials. Restore them back to the vault or purge forever.
        </p>
        <div className="page-hero-actions">
          <Link className="btn btn-secondary" to="/app/vault">
            <IconVault aria-hidden />
            Back to vault
          </Link>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconTrash aria-hidden />
          </div>
          <h3>Loading trash…</h3>
        </div>
      ) : !rows.length ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconTrash aria-hidden />
          </div>
          <h3>Trash is empty</h3>
          <p>Deleted credentials will appear here until you restore or purge them.</p>
        </div>
      ) : (
        <div className="item-list">
          {rows.map((row) => (
            <article key={row.id} className="item-card">
              <Avatar label={row.title || "?"} size={2.3} />
              <div className="item-card-main">
                <h3 className="item-card-title">{row.title || "Untitled"}</h3>
                <div className="item-card-meta">
                  <span>{row.websiteHost || "No website"}</span>
                  <span>
                    Deleted{" "}
                    {row.deletedAt
                      ? new Date(row.deletedAt).toLocaleString()
                      : "—"}
                  </span>
                </div>
              </div>
              <div className="item-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void restore(row.id)}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => void purge(row.id)}
                >
                  Delete forever
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
