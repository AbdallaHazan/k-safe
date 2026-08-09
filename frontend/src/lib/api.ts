const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type TokenPair = { access: string; refresh: string };

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let adminAccessToken: string | null = sessionStorage.getItem("ks_admin_access");
let adminRefreshToken: string | null = sessionStorage.getItem("ks_admin_refresh");

export function setTokens(tokens: TokenPair | null) {
  accessToken = tokens?.access ?? null;
  refreshToken = tokens?.refresh ?? null;
  if (tokens) {
    sessionStorage.setItem("ks_access", tokens.access);
    sessionStorage.setItem("ks_refresh", tokens.refresh);
  } else {
    sessionStorage.removeItem("ks_access");
    sessionStorage.removeItem("ks_refresh");
  }
}

export function loadStoredTokens(): TokenPair | null {
  const access = sessionStorage.getItem("ks_access");
  const refresh = sessionStorage.getItem("ks_refresh");
  if (access && refresh) {
    accessToken = access;
    refreshToken = refresh;
    return { access, refresh };
  }
  return null;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export function setAdminTokens(tokens: TokenPair | null) {
  adminAccessToken = tokens?.access ?? null;
  adminRefreshToken = tokens?.refresh ?? null;
  if (tokens) {
    sessionStorage.setItem("ks_admin_access", tokens.access);
    sessionStorage.setItem("ks_admin_refresh", tokens.refresh);
  } else {
    sessionStorage.removeItem("ks_admin_access");
    sessionStorage.removeItem("ks_admin_refresh");
    sessionStorage.removeItem("ks_admin_profile");
  }
}

export function hasAdminSession() {
  return Boolean(adminAccessToken && adminRefreshToken);
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const obj = body as Record<string, unknown>;
  if (typeof obj.detail === "string") return obj.detail;
  if (Array.isArray(obj.detail)) {
    return obj.detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return JSON.stringify(item);
      })
      .join(" ");
  }

  // Prefer human messages from DRF field errors (skip raw keys like non_field_errors).
  const preferredKeys = ["non_field_errors", "detail", "email", "password", "master_password"];
  for (const key of preferredKeys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value) && value.length) {
      const first = value[0];
      if (typeof first === "string") return first;
      if (first && typeof first === "object" && "msg" in first) {
        return String((first as { msg: unknown }).msg);
      }
    }
  }

  const parts: string[] = [];
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      const text = value
        .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
        .join(" ");
      if (text) parts.push(text);
    } else if (typeof value === "string") {
      parts.push(value);
    }
  }
  return parts.length ? parts.join(" ") : fallback;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access: string; refresh?: string };
    setTokens({
      access: data.access,
      refresh: data.refresh ?? refreshToken,
    });
    return true;
  } catch {
    return false;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (auth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.set("Authorization", `Bearer ${accessToken}`);
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } else {
      onUnauthorized?.();
      throw new ApiError("Session expired", 401, null);
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(
      extractErrorMessage(body, res.statusText || "Request failed"),
      res.status,
      body,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string, auth = true) => apiRequest<T>(path, { method: "GET" }, auth),
  post: <T>(path: string, data?: unknown, auth = true) =>
    apiRequest<T>(
      path,
      {
        method: "POST",
        body: data === undefined ? undefined : JSON.stringify(data),
      },
      auth,
    ),
  patch: <T>(path: string, data: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) =>
    apiRequest<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

async function adminRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (adminAccessToken) {
    headers.set("Authorization", `Bearer ${adminAccessToken}`);
  }
  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && adminRefreshToken) {
    const refresh = await fetch(`${API_BASE}/api/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: adminRefreshToken }),
    });
    if (refresh.ok) {
      const data = (await refresh.json()) as { access: string; refresh?: string };
      setAdminTokens({
        access: data.access,
        refresh: data.refresh ?? adminRefreshToken,
      });
      headers.set("Authorization", `Bearer ${adminAccessToken}`);
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }
  const text = await res.text();
  const body = text ? (() => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  })() : null;
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) setAdminTokens(null);
    throw new ApiError(
      extractErrorMessage(body, res.statusText || "Admin request failed"),
      res.status,
      body,
    );
  }
  return body as T;
}

export const adminApi = {
  get: <T>(path: string) => adminRequest<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    adminRequest<T>(path, {
      method: "POST",
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  delete: <T>(path: string) => adminRequest<T>(path, { method: "DELETE" }),
};
