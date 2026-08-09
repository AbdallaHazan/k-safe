import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { ApiError, api } from "../lib/api";
import { clearAllBioWraps } from "../lib/biometric";
import { prepareRegistrationCrypto } from "../lib/crypto";

type Step = "request" | "reset";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await api.post<{ detail: string }>(
        "/api/forgot-password",
        { email: email.trim() },
        false,
      );
      setMessage(res.detail);
      setStep("reset");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send reset code");
    } finally {
      setLoading(false);
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setLoading(true);
    try {
      const cryptoMaterial = await prepareRegistrationCrypto(newPassword);
      const res = await api.post<{ detail: string }>(
        "/api/forgot-password/reset",
        {
          email: email.trim(),
          email_code: digits,
          new_password: newPassword,
          kdf_salt: cryptoMaterial.kdfSalt,
          encrypted_vault_key: cryptoMaterial.encryptedVaultKey,
          vault_key_nonce: cryptoMaterial.vaultKeyNonce,
        },
        false,
      );
      setMessage(res.detail);
      clearAllBioWraps();
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="brand">
          <BrandMark />
          KeySafe
        </div>
        <h1>Forgot master password</h1>
        <p className="lead">
          We can email a reset code to your account address. Because KeySafe is
          zero-knowledge, resetting creates a new empty vault — old saved passwords
          cannot be recovered.
        </p>

        {error ? <div className="error-banner">{error}</div> : null}
        {message ? <div className="success-banner">{message}</div> : null}

        {step === "request" ? (
          <form className="stack" onSubmit={(e) => void onRequest(e)}>
            <div className="field">
              <label htmlFor="email">Account email (Gmail)</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send reset code"}
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={(e) => void onReset(e)}>
            <div className="field">
              <label htmlFor="code">Email code</label>
              <input
                id="code"
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
            <div className="field">
              <label htmlFor="new-pw">New master password</label>
              <input
                id="new-pw"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-pw">Confirm new password</label>
              <input
                id="confirm-pw"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Resetting…" : "Reset password & wipe vault"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep("request")}
            >
              Resend code
            </button>
          </form>
        )}

        <p className="muted" style={{ textAlign: "center", marginTop: "1.1rem" }}>
          <Link className="link-inline" to="/login">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
