import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import {
  IconCopy,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconGlobe,
  IconPlus,
  IconSearch,
  IconTrash,
  IconVault,
} from "../components/Icons";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getCategoryFormConfig } from "../lib/categoryForms";
import {
  decryptField,
  encryptField,
  extractWebsiteHost,
  scorePasswordStrength,
} from "../lib/crypto";
import type {
  Category,
  CredentialCipher,
  CredentialListItem,
  DecryptedCredential,
} from "../lib/types";

type Draft = {
  title: string;
  username: string;
  email: string;
  password: string;
  website: string;
  notes: string;
  tags: string;
  category: string;
};

const emptyDraft = (): Draft => ({
  title: "",
  username: "",
  email: "",
  password: "",
  website: "",
  notes: "",
  tags: "",
  category: "",
});

export function VaultPage() {
  const { getDek, decrypt } = useAuth();
  const [items, setItems] = useState<DecryptedCredential[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      const qs = params.toString() ? `?${params}` : "";
      const [list, cats] = await Promise.all([
        api.get<CredentialListItem[]>(`/api/vault${qs}`),
        api.get<Category[]>("/api/categories"),
      ]);
      setCategories(cats);
      const dek = getDek();
      const decrypted = await Promise.all(
        list.map(async (item) => {
          const [title, username, email, websiteUrl] = await Promise.all([
            decryptField(item.encrypted_title, dek),
            decryptField(item.encrypted_username, dek),
            decryptField(item.encrypted_email, dek),
            decryptField(item.encrypted_website, dek),
          ]);
          return {
            id: item.id,
            categoryId: item.category_id,
            title,
            username,
            email,
            password: "",
            notes: "",
            tags: "",
            websiteUrl,
            websiteHost: item.website_host,
            passwordStrength: item.password_strength,
            isFavorite: item.is_favorite,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
          } satisfies DecryptedCredential;
        }),
      );
      setItems(decrypted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vault");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, getDek]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.username.toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q) ||
        i.websiteUrl.toLowerCase().includes(q) ||
        i.websiteHost.toLowerCase().includes(q),
    );
  }, [items, query]);

  const draftCategoryName = useMemo(
    () => categories.find((c) => c.id === draft.category)?.name,
    [categories, draft.category],
  );
  const formConfig = useMemo(
    () => getCategoryFormConfig(draftCategoryName),
    [draftCategoryName],
  );

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setError("");
    setModalOpen(true);
  }

  async function openEdit(id: string) {
    setError("");
    try {
      const full = await api.get<CredentialCipher>(`/api/vault/${id}`);
      const dek = getDek();
      const [title, username, email, password, websiteUrl, notes, tags] =
        await Promise.all([
          decryptField(full.encrypted_title, dek),
          decryptField(full.encrypted_username, dek),
          decryptField(full.encrypted_email, dek),
          decryptField(full.encrypted_password, dek),
          decryptField(full.encrypted_website, dek),
          decryptField(full.encrypted_notes, dek),
          decryptField(full.encrypted_tags, dek),
        ]);
      setEditingId(id);
      setDraft({
        title,
        username,
        email,
        password,
        website: websiteUrl,
        notes,
        tags,
        category: full.category ? String(full.category) : "",
      });
      setModalOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open entry");
    }
  }

  async function revealPassword(id: string) {
    try {
      if (revealed[id]) {
        setRevealed((prev) => ({ ...prev, [id]: false }));
        return;
      }
      const full = await api.get<CredentialCipher>(`/api/vault/${id}`);
      const password = await decrypt(full.encrypted_password);
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, password } : i)),
      );
      setRevealed((prev) => ({ ...prev, [id]: true }));
      await api.post(`/api/vault/${id}/reveal`, { reason: "reveal" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reveal failed");
    }
  }

  async function copyPassword(id: string) {
    try {
      let password = items.find((i) => i.id === id)?.password;
      if (!password) {
        const full = await api.get<CredentialCipher>(`/api/vault/${id}`);
        password = await decrypt(full.encrypted_password);
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, password: password! } : i)),
        );
        await api.post(`/api/vault/${id}/reveal`, { reason: "copy" });
      }
      await navigator.clipboard.writeText(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy failed");
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const dek = getDek();
      const title = draft.title.trim();
      const password = draft.password;
      if (!title || !password) {
        setError("Title and password are required.");
        setSaving(false);
        return;
      }
      const website = draft.website.trim();
      const payload = {
        category: draft.category || null,
        encrypted_title: await encryptField(title, dek),
        encrypted_username: await encryptField(draft.username.trim(), dek),
        encrypted_email: await encryptField(draft.email.trim(), dek),
        encrypted_password: await encryptField(password, dek),
        encrypted_notes: await encryptField(draft.notes.trim(), dek),
        encrypted_tags: await encryptField(draft.tags.trim(), dek),
        encrypted_website: await encryptField(website, dek),
        website_host: extractWebsiteHost(website),
        password_strength: scorePasswordStrength(password),
        password_changed_at: new Date().toISOString(),
      };
      if (editingId) {
        await api.patch(`/api/vault/${editingId}`, payload);
      } else {
        await api.post("/api/vault", payload);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Move this credential to trash?")) return;
    try {
      await api.delete(`/api/vault/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="stack-lg">
      <section className="page-hero">
        <h1>Vault</h1>
        <p className="page-lead">
          Encrypted credentials, ready when you are. Search, reveal, and manage
          entries without leaving zero-knowledge mode.
        </p>
        <div className="page-hero-actions">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <IconPlus aria-hidden />
            Add credential
          </button>
          <Link className="btn btn-secondary" to="/app/trash">
            <IconTrash aria-hidden />
            Trash
          </Link>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="filter-bar">
        <div className="search-field">
          <IconSearch aria-hidden />
          <input
            id="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, username, site…"
            aria-label="Search vault"
          />
        </div>
        <div className="field" style={{ flex: "0 1 200px", minWidth: "160px" }}>
          <label htmlFor="cat" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Category
          </label>
          <select
            id="cat"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconVault aria-hidden />
          </div>
          <h3>Decrypting vault…</h3>
          <p>Unlocking ciphertext on this device.</p>
        </div>
      ) : !filtered.length ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconVault aria-hidden />
          </div>
          <h3>No credentials yet</h3>
          <p>Add your first login to start building a private, encrypted vault.</p>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <IconPlus aria-hidden />
            Add credential
          </button>
        </div>
      ) : (
        <div className="item-list">
          {filtered.map((item) => {
            const isOpen = !!revealed[item.id];
            return (
              <article key={item.id} className="item-card">
                <Avatar label={item.title || "?"} size={2.45} />
                <div className="item-card-main">
                  <h3 className="item-card-title">{item.title || "Untitled"}</h3>
                  <div className="item-card-meta">
                    <span>{item.username || item.email || "No username"}</span>
                    {item.websiteHost || item.websiteUrl ? (
                      <span>
                        <IconGlobe aria-hidden />
                        {item.websiteHost || item.websiteUrl}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ marginTop: "0.65rem" }}>
                    <span className="secret-pill">
                      {isOpen && item.password ? item.password : "••••••••••••"}
                    </span>
                  </div>
                </div>
                <div className="item-actions">
                  <button
                    type="button"
                    className="icon-action"
                    title={isOpen ? "Hide password" : "Reveal password"}
                    aria-label={isOpen ? "Hide password" : "Reveal password"}
                    onClick={() => void revealPassword(item.id)}
                  >
                    {isOpen ? <IconEyeOff aria-hidden /> : <IconEye aria-hidden />}
                  </button>
                  <button
                    type="button"
                    className="icon-action"
                    title="Copy password"
                    aria-label="Copy password"
                    onClick={() => void copyPassword(item.id)}
                  >
                    <IconCopy aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-action"
                    title="Edit"
                    aria-label="Edit credential"
                    onClick={() => void openEdit(item.id)}
                  >
                    <IconEdit aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-action is-danger"
                    title="Move to trash"
                    aria-label="Move to trash"
                    onClick={() => void onDelete(item.id)}
                  >
                    <IconTrash aria-hidden />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal
            aria-labelledby="cred-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="cred-modal-title">
                  {editingId ? "Edit credential" : "New credential"}
                </h2>
                <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
                  Fields are encrypted on this device before sync.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setModalOpen(false)}
              >
                Close
              </button>
            </div>

            <form className="stack" onSubmit={(e) => void onSave(e)}>
              <div className="form-section">
                <p className="form-section-title">Basics</p>
                <div className="form-grid">
                  <div className="field field-span-2">
                    <label htmlFor="category">Category</label>
                    <select
                      id="category"
                      value={draft.category}
                      onChange={(e) => updateDraft("category", e.target.value)}
                    >
                      <option value="">No category (generic form)</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                      {formConfig.hint}
                    </p>
                  </div>
                  <div className="field field-span-2">
                    <label htmlFor="title">{formConfig.titleLabel}</label>
                    <input
                      id="title"
                      required
                      autoFocus
                      placeholder={formConfig.titlePlaceholder}
                      value={draft.title}
                      onChange={(e) => updateDraft("title", e.target.value)}
                    />
                  </div>
                  <div className="field field-span-2">
                    <label htmlFor="password">{formConfig.passwordLabel}</label>
                    <input
                      id="password"
                      required
                      type="text"
                      autoComplete="off"
                      placeholder={formConfig.passwordPlaceholder}
                      value={draft.password}
                      onChange={(e) => updateDraft("password", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {formConfig.fields.length ? (
                <div className="form-section">
                  <p className="form-section-title">Details</p>
                  <div className="form-grid">
                    {formConfig.fields.map((field) => (
                      <div
                        className={`field${field.multiline ? " field-span-2" : ""}`}
                        key={field.key}
                      >
                        <label htmlFor={`f-${field.key}`}>{field.label}</label>
                        {field.multiline ? (
                          <textarea
                            id={`f-${field.key}`}
                            rows={3}
                            placeholder={field.placeholder}
                            value={draft[field.key]}
                            onChange={(e) => updateDraft(field.key, e.target.value)}
                          />
                        ) : (
                          <input
                            id={`f-${field.key}`}
                            placeholder={field.placeholder}
                            value={draft[field.key]}
                            onChange={(e) => updateDraft(field.key, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="modal-foot">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save credential"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
