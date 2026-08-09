import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { IconFingerprint } from "../components/Icons";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  biometricSupported,
  clearBiometricRequired,
  credentialToJson,
  extractPrfResult,
  isBiometricRequired,
  loadBioWrap,
  markBiometricSessionOk,
  reviveCreationOptions,
  reviveRequestOptions,
  saveBioWrap,
  wrapDekWithPrfKey,
} from "../lib/biometric";

export function SetupBiometricPage() {
  const { user, getDek, refreshUser, ready, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supported = biometricSupported();
  const required = isBiometricRequired();
  const existingWrap = user ? loadBioWrap(user.id) : null;

  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;

  // Active users with device wrap → confirm after password.
  if (user.biometric_enabled && existingWrap && supported) {
    return (
      <ConfirmBiometric
        email={user.email}
        busy={busy}
        setBusy={setBusy}
        error={error}
        setError={setError}
        onDone={() => {
          clearBiometricRequired();
          markBiometricSessionOk();
          navigate("/app", { replace: true });
        }}
        onCancel={() => void logout()}
      />
    );
  }

  // Active user on a new device without local wrap — must enroll this device.
  if (user.biometric_enabled && !existingWrap) {
    return (
      <EnrollBiometric
        title="Set up this device"
        lead="Your account is active. Enable biometrics on this device before opening the vault."
        supported={supported}
        busy={busy}
        error={error}
        userEmail={user.email}
        getDek={getDek}
        refreshUser={refreshUser}
        setBusy={setBusy}
        setError={setError}
        onDone={() => {
          clearBiometricRequired();
          markBiometricSessionOk();
          navigate("/app", { replace: true });
        }}
        onUnsupported={() => void logout()}
      />
    );
  }

  // Registration onboarding (pending until biometric_enabled becomes true).
  if (required || !user.biometric_enabled) {
    if (!supported) {
      return (
        <div className="auth-layout">
          <div className="auth-card">
            <div className="brand">
              <BrandMark />
              KeySafe
            </div>
            <h1>Biometrics required</h1>
            <p className="lead">
              This browser cannot complete biometric onboarding, so your account
              stays pending and cannot open the vault.
            </p>
            <div className="error-banner">
              Please contact a system administrator, or try again on a supported
              device (Windows Hello / Chrome or Edge with biometrics).
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%", marginTop: "1rem" }}
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
        </div>
      );
    }

    return (
      <EnrollBiometric
        title="Set up biometric unlock"
        lead="Biometric setup is required to activate your account. Until this is done, your account stays pending and cannot sign in again."
        supported={supported}
        busy={busy}
        error={error}
        userEmail={user.email}
        getDek={getDek}
        refreshUser={refreshUser}
        setBusy={setBusy}
        setError={setError}
        onDone={() => {
          clearBiometricRequired();
          markBiometricSessionOk();
          navigate("/app", { replace: true });
        }}
        onUnsupported={() => void logout()}
      />
    );
  }

  // Fallback: pending session without a valid path.
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="brand">
          <BrandMark />
          KeySafe
        </div>
        <h1>Access unavailable</h1>
        <p className="lead">
          Your account is pending and does not have vault access. Please contact a
          system administrator.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%" }}
          onClick={() => void logout()}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function ConfirmBiometric({
  email,
  busy,
  setBusy,
  error,
  setError,
  onDone,
  onCancel,
}: {
  email: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  error: string;
  setError: (v: string) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  async function confirm() {
    setError("");
    setBusy(true);
    try {
      const start = await api.post<{ options: Record<string, unknown> }>(
        "/api/webauthn/login/options",
        { email },
        false,
      );
      const cred = (await navigator.credentials.get({
        publicKey: reviveRequestOptions(start.options),
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("Biometric confirmation was cancelled.");
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Biometric confirmation failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="brand">
          <BrandMark />
          KeySafe
        </div>
        <h1>Confirm it’s you</h1>
        <p className="lead">
          Your password was accepted. Confirm with Windows Hello, Touch ID, or Face
          ID to open the vault.
        </p>
        {error ? <div className="error-banner">{error}</div> : null}
        <div className="stack">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void confirm()}
          >
            <IconFingerprint aria-hidden />
            {busy ? "Waiting for biometrics…" : "Confirm with biometrics"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel and sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function EnrollBiometric({
  title,
  lead,
  supported,
  busy,
  error,
  userEmail,
  getDek,
  refreshUser,
  setBusy,
  setError,
  onDone,
  onUnsupported,
}: {
  title: string;
  lead: string;
  supported: boolean;
  busy: boolean;
  error: string;
  userEmail: string;
  getDek: () => Uint8Array;
  refreshUser: () => Promise<void>;
  setBusy: (v: boolean) => void;
  setError: (v: string) => void;
  onDone: () => void;
  onUnsupported: () => void;
}) {
  const { user } = useAuth();

  async function enable() {
    setError("");
    if (!user) return;
    if (!supported) {
      onUnsupported();
      return;
    }
    setBusy(true);
    try {
      const options = await api.post<Record<string, unknown>>(
        "/api/webauthn/register/options",
      );
      const cred = (await navigator.credentials.create({
        publicKey: reviveCreationOptions(options),
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("Biometric setup was cancelled.");

      const verifyRes = await api.post<{ credential_id: string }>(
        "/api/webauthn/register/verify",
        { credential: credentialToJson(cred), device_name: "This device" },
      );

      const authOpts = await api.post<{ options: Record<string, unknown> }>(
        "/api/webauthn/login/options",
        { email: userEmail },
        false,
      );
      const assertion = (await navigator.credentials.get({
        publicKey: reviveRequestOptions(authOpts.options),
      })) as PublicKeyCredential | null;
      if (!assertion) throw new Error("Biometric confirmation was cancelled.");

      const prf = extractPrfResult(assertion);
      if (!prf) {
        throw new Error(
          "This device does not support biometric vault unlock (WebAuthn PRF). Use Windows Hello on Chrome/Edge, or contact a system administrator.",
        );
      }

      const wrapped = await wrapDekWithPrfKey(getDek(), prf);
      saveBioWrap({
        userId: user.id,
        credentialId: verifyRes.credential_id,
        wrappedDek: wrapped.wrappedDek,
        nonce: wrapped.nonce,
      });
      await refreshUser();
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Biometric setup failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="brand">
          <BrandMark />
          KeySafe
        </div>
        <h1>{title}</h1>
        <p className="lead">{lead}</p>
        {error ? <div className="error-banner">{error}</div> : null}
        <p className="muted">
          You will confirm with your fingerprint, face, or PIN twice (register, then
          protect your vault key on this device). There is no skip — pending accounts
          cannot open the vault.
        </p>
        <div className="stack" style={{ marginTop: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void enable()}
          >
            <IconFingerprint aria-hidden />
            {busy ? "Waiting for biometrics…" : "Enable biometric unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
