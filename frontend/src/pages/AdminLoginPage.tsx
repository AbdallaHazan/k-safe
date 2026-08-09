import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { ApiError, api, setAdminTokens } from "../lib/api";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [preAuthToken, setPreAuthToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{
        pre_auth_token: string;
        email: string;
        detail: string;
      }>("/api/admin/login", { email: email.trim(), password }, false);
      setPreAuthToken(res.pre_auth_token);
      setEmail(res.email);
      setMessage(res.detail);
      setPassword("");
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Admin sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e: FormEvent) {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{
        tokens: { access: string; refresh: string };
        admin: {
          id: string;
          email: string;
          name: string;
          is_superuser: boolean;
        };
      }>(
        "/api/admin/login/verify",
        {
          email,
          email_code: digits,
          pre_auth_token: preAuthToken,
        },
        false,
      );
      setAdminTokens(res.tokens);
      sessionStorage.setItem("ks_admin_profile", JSON.stringify(res.admin));
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="brand">
          <BrandMark />
          KeySafe System Admin
        </div>
        <h1>Administrator sign in</h1>
        <p className="lead">
          Dedicated staff access. Admin accounts cannot open a user vault.
        </p>

        {error ? <div className="error-banner">{error}</div> : null}
        {message ? <div className="success-banner">{message}</div> : null}

        {step === "password" ? (
          <form className="stack" onSubmit={(e) => void submitPassword(e)}>
            <div className="field">
              <label htmlFor="admin-email">Admin email</label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="admin-password">Admin password</label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? "Checking…" : "Continue"}
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={(e) => void submitOtp(e)}>
            <div className="field">
              <label htmlFor="admin-code">Email verification code</label>
              <input
                id="admin-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
              />
            </div>
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? "Verifying…" : "Open system admin"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
