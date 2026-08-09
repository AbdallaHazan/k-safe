import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Verify2FAPage() {
  const { pending2fa, verify2fa } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!pending2fa) {
    return <Navigate to="/login" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const digits = code.replace(/\D/g, "");
      if (digits.length !== 6) {
        setError("Enter the 6-digit code from your email.");
        setLoading(false);
        return;
      }
      await verify2fa(digits);
      navigate("/setup-biometric", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
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
        <h1>Check your email</h1>
        <p className="lead">
          We sent a 6-digit code to your Gmail / account email. Enter it to finish
          signing in.
        </p>

        <form className="stack" onSubmit={(e) => void onSubmit(e)}>
          {error ? <div className="error-banner">{error}</div> : null}

          <div className="field">
            <label htmlFor="email-otp">Email code</label>
            <input
              id="email-otp"
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

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Verifying…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
