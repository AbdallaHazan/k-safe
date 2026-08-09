import { FormEvent, useCallback, useEffect, useState } from "react";
import { Avatar } from "../components/Avatar";
import { IconEdit, IconFolder, IconPlus, IconTrash } from "../components/Icons";
import { api, ApiError } from "../lib/api";
import type { Category } from "../lib/types";

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<Category[]>("/api/categories");
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.post("/api/categories", { name: name.trim() });
      setName("");
      setMessage("Category created.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    }
  }

  async function onRename(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setError("");
    setMessage("");
    try {
      await api.patch(`/api/categories/${editingId}`, { name: editName.trim() });
      setEditingId(null);
      setEditName("");
      setMessage("Category renamed.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rename failed");
    }
  }

  async function onDelete(id: string, isDefault: boolean) {
    if (isDefault) {
      setError("Default categories cannot be deleted.");
      return;
    }
    if (!confirm("Delete this category?")) return;
    setError("");
    setMessage("");
    try {
      await api.delete(`/api/categories/${id}`);
      setMessage("Category deleted.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <div className="stack-lg">
      <section className="page-hero">
        <h1>Categories</h1>
        <p className="page-lead">
          Organize vault entries into clear groups. Defaults are seeded when you
          create an account.
        </p>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <form className="filter-bar" onSubmit={(e) => void onCreate(e)}>
        <div className="field" style={{ flex: "1 1 240px" }}>
          <label htmlFor="cat-name">New category</label>
          <input
            id="cat-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Gaming"
          />
        </div>
        <button className="btn btn-primary" type="submit" style={{ alignSelf: "end" }}>
          <IconPlus aria-hidden />
          Add category
        </button>
      </form>

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconFolder aria-hidden />
          </div>
          <h3>Loading categories…</h3>
        </div>
      ) : !categories.length ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconFolder aria-hidden />
          </div>
          <h3>No categories yet</h3>
          <p>Create your first category to start organizing credentials.</p>
        </div>
      ) : (
        <div className="tile-grid">
          {categories.map((c) => (
            <article key={c.id} className="tile-card">
              <div className="tile-card-top">
                <div>
                  <Avatar label={c.name} size={2.2} />
                  {editingId === c.id ? (
                    <form className="stack" style={{ marginTop: "0.75rem" }} onSubmit={(e) => void onRename(e)}>
                      <input
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        aria-label="Category name"
                      />
                      <div className="row">
                        <button className="btn btn-primary btn-sm" type="submit">
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <h3>{c.name}</h3>
                      <div className="count">
                        {c.credential_count ?? 0} credential
                        {(c.credential_count ?? 0) === 1 ? "" : "s"}
                      </div>
                    </>
                  )}
                </div>
                <span className="badge">{c.is_default ? "Default" : "Custom"}</span>
              </div>
              {editingId === c.id ? null : (
                <div className="item-actions" style={{ justifyContent: "flex-start" }}>
                  <button
                    type="button"
                    className="icon-action"
                    title="Rename"
                    aria-label={`Rename ${c.name}`}
                    onClick={() => {
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                  >
                    <IconEdit aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-action is-danger"
                    title="Delete"
                    aria-label={`Delete ${c.name}`}
                    disabled={c.is_default}
                    onClick={() => void onDelete(c.id, c.is_default)}
                  >
                    <IconTrash aria-hidden />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
