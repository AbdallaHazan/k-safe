import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import {
  IconFingerprint,
  IconLock,
  IconShield,
} from "../components/Icons";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email.trim(), masterPassword);
      if (result === "2fa") {
        navigate("/verify-2fa");
        return;
      }
      // After credentials: biometric confirm or setup (never parallel to password).
      navigate("/setup-biometric", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-layout">
      <aside className="auth-showcase">
        <div className="brand">
          <BrandMark />
          KeySafe
        </div>
        <div className="auth-showcase-copy">
          <h2>Your vault stays private — even from us.</h2>
          <p>
            Zero-knowledge encryption means credentials are sealed on this device
            before they ever reach the server.
          </p>
          <div className="auth-showcase-points">
            <div>
              <span>
                <IconLock aria-hidden />
              </span>
              AES-256-GCM vault encryption
            </div>
            <div>
              <span>
                <IconShield aria-hidden />
              </span>
              Optional email 2FA on every unlock
            </div>
            <div>
              <span>
                <IconFingerprint aria-hidden />
              </span>
              Biometric confirm after you sign in
            </div>
          </div>
        </div>
        <div className="auth-showcase-foot">
          Password manager · zero-knowledge by design
        </div>
      </aside>

      <div className="auth-panel">
        <div className="auth-card">
          <div className="brand">
            <BrandMark />
            KeySafe
          </div>
          <h1>Welcome back</h1>
          <p className="lead">
            Enter your email and master password. Biometrics are requested next.
          </p>

          <form className="stack" onSubmit={(e) => void onSubmit(e)}>
            {error ? <div className="error-banner">{error}</div> : null}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Master password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Checking…" : "Continue"}
            </button>
            <p style={{ textAlign: "right", margin: 0 }}>
              <Link className="link-inline" to="/forgot-password">
                Forgot master password?
              </Link>
            </p>
          </form>

          <p className="auth-footer muted">
            New here?{" "}
            <Link className="link-inline" to="/register">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
