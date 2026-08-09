import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { IconFingerprint, IconLock, IconShield } from "../components/Icons";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { biometricSupported, markBiometricRequired } from "../lib/biometric";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (masterPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        masterPassword,
      });
      markBiometricRequired();
      navigate("/setup-biometric", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message || "Registration failed");
      } else {
        setError("Registration failed");
      }
    } finally {
      setLoading(false);
    }
  }

  const showBioHint = biometricSupported();

  return (
    <div className="auth-layout">
      <aside className="auth-showcase">
        <div className="brand">
          <BrandMark />
          KeySafe
        </div>
        <div className="auth-showcase-copy">
          <h2>Create a vault that only you can open.</h2>
          <p>
            Your master password never leaves this browser in plaintext. We store
            wrapped keys and ciphertext only.
          </p>
          <div className="auth-showcase-points">
            <div>
              <span>
                <IconLock aria-hidden />
              </span>
              Client-side Argon2id key wrapping
            </div>
            <div>
              <span>
                <IconShield aria-hidden />
              </span>
              Email 2FA available after signup
            </div>
            <div>
              <span>
                <IconFingerprint aria-hidden />
              </span>
              {showBioHint
                ? "Biometric setup required next"
                : "Master password unlock everywhere"}
            </div>
          </div>
        </div>
        <div className="auth-showcase-foot">
          Password manager · zero-knowledge by design
        </div>
      </aside>

      <div className="auth-panel">
        <div className="auth-card">
          <div className="brand" style={{ justifyContent: "center" }}>
            <BrandMark />
            KeySafe
          </div>
          <h1>Create your vault</h1>
          <p className="lead">
            Your master password never leaves this device in plaintext.
            {showBioHint
              ? " After creating your account, enable biometric unlock before entering the vault."
              : ""}
          </p>

          <form className="stack" onSubmit={(e) => void onSubmit(e)}>
            {error ? <div className="error-banner">{error}</div> : null}
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
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
                autoComplete="new-password"
                required
                minLength={8}
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
              />
              <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
                At least 8 characters, with upper, lower, digit, and a symbol.
              </p>
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm master password</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Creating vault…" : "Create account"}
            </button>
          </form>

          <p className="auth-footer muted">
            Already have a vault?{" "}
            <Link className="link-inline" to="/login">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
