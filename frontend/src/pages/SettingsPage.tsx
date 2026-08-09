import { FormEvent, useState } from "react";
import { SettingRow } from "../components/SettingRow";
import {
  IconDownload,
  IconFingerprint,
  IconKey,
  IconMail,
  IconTrash,
  IconUpload,
  IconUser,
} from "../components/Icons";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  biometricSupported,
  clearBioWrap,
  credentialToJson,
  extractPrfResult,
  reviveCreationOptions,
  reviveRequestOptions,
  saveBioWrap,
  wrapDekWithPrfKey,
} from "../lib/biometric";
import { deriveWrapKey, generateSaltHex, wrapDek } from "../lib/crypto";

type SectionKey =
  | "profile"
  | "biometric"
  | "password"
  | "2fa"
  | "export"
  | "import"
  | "delete";

export function SettingsPage() {
  const { user, logout, getDek, refreshUser } = useAuth();
  const [open, setOpen] = useState<SectionKey | null>(null);
  const toggle = (key: SectionKey) =>
    setOpen((prev) => (prev === key ? null : key));

  const [name, setName] = useState(user?.name ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [pendingEmail2fa, setPendingEmail2fa] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disableCodeSent, setDisableCodeSent] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [exportPassword, setExportPassword] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [bioPassword, setBioPassword] = useState("");
  const [bioBusy, setBioBusy] = useState(false);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.patch("/api/profile", { name: name.trim() });
      setMessage("Profile updated.");
      await refreshUser();
      setOpen(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    try {
      const dek = getDek();
      const kdfSalt = generateSaltHex(16);
      const wrapKey = await deriveWrapKey(newPassword, kdfSalt);
      const wrapped = await wrapDek(dek, wrapKey);
      await api.post("/api/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
        encrypted_vault_key: wrapped.encryptedVaultKey,
        vault_key_nonce: wrapped.vaultKeyNonce,
        kdf_salt: kdfSalt,
      });
      if (user) clearBioWrap(user.id);
      setMessage("Master password updated. Please sign in again.");
      setTimeout(() => void logout(), 800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Password change failed");
    }
  }

  async function start2fa() {
    setError("");
    setMessage("");
    try {
      const res = await api.post<{ message: string; email_hint: string }>(
        "/api/enable-2fa",
      );
      setPendingEmail2fa(true);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start 2FA");
    }
  }

  async function confirm2fa(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const code = confirmCode.replace(/\D/g, "");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    try {
      await api.post("/api/confirm-2fa", { email_code: code });
      setMessage("Email 2FA enabled. Future logins will require a code sent to your email.");
      setPendingEmail2fa(false);
      setConfirmCode("");
      await refreshUser();
      setOpen(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Confirmation failed");
    }
  }

  async function sendDisable2faCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const res = await api.post<{ otp_sent?: boolean; message?: string }>(
        "/api/disable-2fa",
        { master_password: disablePassword },
      );
      if (res.otp_sent) {
        setDisableCodeSent(true);
        setMessage(res.message || "Check your email for the disable code.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send disable code");
    }
  }

  async function disable2fa(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const code = disableCode.replace(/\D/g, "");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    try {
      await api.post("/api/disable-2fa", {
        master_password: disablePassword,
        email_code: code,
      });
      setMessage("Email 2FA disabled.");
      setDisablePassword("");
      setDisableCode("");
      setDisableCodeSent(false);
      await refreshUser();
      setOpen(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not disable 2FA");
    }
  }

  async function enableBiometric() {
    setError("");
    setMessage("");
    if (!biometricSupported()) {
      setError("Biometrics are not supported in this browser.");
      return;
    }
    if (!user) return;
    setBioBusy(true);
    try {
      const options = await api.post<Record<string, unknown>>(
        "/api/webauthn/register/options",
      );
      const cred = (await navigator.credentials.create({
        publicKey: reviveCreationOptions(options),
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("Biometric registration was cancelled.");

      const verifyRes = await api.post<{ credential_id: string }>(
        "/api/webauthn/register/verify",
        { credential: credentialToJson(cred), device_name: "This device" },
      );

      const authOpts = await api.post<{ options: Record<string, unknown> }>(
        "/api/webauthn/login/options",
        { email: user.email },
        false,
      );
      const assertion = (await navigator.credentials.get({
        publicKey: reviveRequestOptions(authOpts.options),
      })) as PublicKeyCredential | null;
      if (!assertion) throw new Error("Biometric confirmation was cancelled.");
      const prf = extractPrfResult(assertion);
      if (!prf) {
        throw new Error(
          "Your authenticator does not support WebAuthn PRF (needed to protect the vault key). Try Windows Hello on Chrome/Edge, or keep using your master password.",
        );
      }
      const wrapped = await wrapDekWithPrfKey(getDek(), prf);
      saveBioWrap({
        userId: user.id,
        credentialId: verifyRes.credential_id,
        wrappedDek: wrapped.wrappedDek,
        nonce: wrapped.nonce,
      });
      setMessage("Biometric unlock enabled on this device.");
      await refreshUser();
      setOpen(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Biometric setup failed",
      );
    } finally {
      setBioBusy(false);
    }
  }

  async function disableBiometric(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.post("/api/webauthn/disable", { master_password: bioPassword });
      if (user) clearBioWrap(user.id);
      setBioPassword("");
      setMessage("Biometric unlock disabled.");
      await refreshUser();
      setOpen(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not disable biometrics");
    }
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/api/delete-account", {
        master_password: deletePassword,
        confirmation: deleteConfirm,
      });
      if (user) clearBioWrap(user.id);
      await logout();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Deletion failed");
    }
  }

  async function exportVault(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const data = await api.post<Record<string, unknown>>("/api/vault/export", {
        master_password: exportPassword,
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `keysafe-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportPassword("");
      setMessage("Encrypted vault export downloaded.");
      setOpen(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    }
  }

  async function importVault(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!importFile) {
      setError("Choose an export JSON file first.");
      return;
    }
    try {
      const text = await importFile.text();
      const payload = JSON.parse(text) as Record<string, unknown>;
      const res = await api.post<{ imported: number }>("/api/vault/import", {
        master_password: importPassword,
        payload,
      });
      setImportPassword("");
      setImportFile(null);
      setMessage(`Imported ${res.imported} credential(s).`);
      setOpen(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    }
  }

  const bioEnabled = !!user?.biometric_enabled;
  const twoFaEnabled = !!user?.two_factor_enabled;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-lead">Profile, biometrics, email 2FA, and vault backup.</p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <div className="settings-groups">
        <section>
          <p className="settings-group-title">Account</p>
          <div className="settings-group-items">
            <SettingRow
              icon={<IconUser />}
              title="Profile"
              description={`${user?.name ?? ""} · ${user?.email ?? ""}`}
              open={open === "profile"}
              onToggle={() => toggle("profile")}
              actionLabel="Edit"
            >
              <form className="stack" onSubmit={(e) => void saveProfile(e)}>
                <div className="field">
                  <label htmlFor="name">Name</label>
                  <input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input value={user?.email ?? ""} disabled />
                </div>
                <button className="btn btn-primary" type="submit" style={{ width: "fit-content" }}>
                  Save profile
                </button>
              </form>
            </SettingRow>

            <SettingRow
              icon={<IconKey />}
              title="Master password"
              description="Used to derive your vault encryption key. Changing it re-encrypts your vault key."
              open={open === "password"}
              onToggle={() => toggle("password")}
              actionLabel="Change"
            >
              <form className="stack" onSubmit={(e) => void changePassword(e)}>
                <div className="field">
                  <label htmlFor="current">Current password</label>
                  <input
                    id="current"
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="newpw">New password</label>
                  <input
                    id="newpw"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="confirm">Confirm new password</label>
                  <input
                    id="confirm"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <button className="btn btn-primary" type="submit" style={{ width: "fit-content" }}>
                  Update master password
                </button>
              </form>
            </SettingRow>

            <SettingRow
              icon={<IconTrash />}
              title="Delete account"
              description="Permanently removes your account and all vault ciphertext. This cannot be undone."
              open={open === "delete"}
              onToggle={() => toggle("delete")}
              actionLabel="Delete"
              actionTone="danger"
            >
              <form className="stack" onSubmit={(e) => void deleteAccount(e)}>
                <div className="field">
                  <label htmlFor="del-pw">Master password</label>
                  <input
                    id="del-pw"
                    type="password"
                    required
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="del-confirm">Type DELETE to confirm</label>
                  <input
                    id="del-confirm"
                    required
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                  />
                </div>
                <button className="btn btn-danger" type="submit" style={{ width: "fit-content" }}>
                  Delete account permanently
                </button>
              </form>
            </SettingRow>
          </div>
        </section>

        <section>
          <p className="settings-group-title">Security</p>
          <div className="settings-group-items">
            <SettingRow
              icon={<IconFingerprint />}
              title="Biometric unlock"
              description="Uses Windows Hello / Touch ID / Face ID when WebAuthn PRF is available."
              status={
                <span className={`badge ${bioEnabled ? "status-on" : "status-off"}`}>
                  {bioEnabled ? "Enabled" : "Off"}
                </span>
              }
              open={open === "biometric"}
              onToggle={() => toggle("biometric")}
              actionLabel={bioEnabled ? "Disable" : "Enable"}
              actionTone={bioEnabled ? "danger" : "default"}
            >
              {!bioEnabled ? (
                <div className="stack">
                  <p className="muted" style={{ margin: 0 }}>
                    You will confirm with your fingerprint, face, or PIN to protect
                    your vault key on this device.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: "fit-content" }}
                    disabled={bioBusy}
                    onClick={() => void enableBiometric()}
                  >
                    {bioBusy ? "Waiting for biometrics…" : "Enable biometric unlock"}
                  </button>
                </div>
              ) : (
                <form className="stack" onSubmit={(e) => void disableBiometric(e)}>
                  <div className="field">
                    <label htmlFor="bio-off">Master password</label>
                    <input
                      id="bio-off"
                      type="password"
                      required
                      value={bioPassword}
                      onChange={(e) => setBioPassword(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-danger" type="submit" style={{ width: "fit-content" }}>
                    Disable biometric unlock
                  </button>
                </form>
              )}
            </SettingRow>

            <SettingRow
              icon={<IconMail />}
              title="Email two-factor authentication"
              description={`Codes are sent to ${user?.email ?? "your account email"} when you sign in.`}
              status={
                <span className={`badge ${twoFaEnabled ? "status-on" : "status-off"}`}>
                  {twoFaEnabled ? "On" : "Off"}
                </span>
              }
              open={open === "2fa"}
              onToggle={() => toggle("2fa")}
              actionLabel={twoFaEnabled ? "Disable" : "Enable"}
              actionTone={twoFaEnabled ? "danger" : "default"}
            >
              {!twoFaEnabled ? (
                !pendingEmail2fa ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: "fit-content" }}
                    onClick={() => void start2fa()}
                  >
                    Send code to email
                  </button>
                ) : (
                  <form className="stack" onSubmit={(e) => void confirm2fa(e)}>
                    <p className="muted" style={{ margin: 0 }}>
                      Enter the 6-digit code we emailed you to turn this on.
                    </p>
                    <div className="field">
                      <label htmlFor="confirm2fa">Email code</label>
                      <input
                        id="confirm2fa"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        required
                        value={confirmCode}
                        onChange={(e) =>
                          setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="000000"
                      />
                    </div>
                    <div className="row">
                      <button className="btn btn-primary" type="submit">
                        Confirm and enable
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void start2fa()}
                      >
                        Resend code
                      </button>
                    </div>
                  </form>
                )
              ) : !disableCodeSent ? (
                <form className="stack" onSubmit={(e) => void sendDisable2faCode(e)}>
                  <div className="field">
                    <label htmlFor="disable-pw">Master password</label>
                    <input
                      id="disable-pw"
                      type="password"
                      required
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-danger" type="submit" style={{ width: "fit-content" }}>
                    Send disable code to email
                  </button>
                </form>
              ) : (
                <form className="stack" onSubmit={(e) => void disable2fa(e)}>
                  <div className="field">
                    <label htmlFor="disable-pw2">Master password</label>
                    <input
                      id="disable-pw2"
                      type="password"
                      required
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="disable-code">Email code</label>
                    <input
                      id="disable-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      value={disableCode}
                      onChange={(e) =>
                        setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="000000"
                    />
                  </div>
                  <button className="btn btn-danger" type="submit" style={{ width: "fit-content" }}>
                    Disable email 2FA
                  </button>
                </form>
              )}
            </SettingRow>
          </div>
        </section>

        <section>
          <p className="settings-group-title">Vault data</p>
          <div className="settings-group-items">
            <SettingRow
              icon={<IconDownload />}
              title="Export vault"
              description="Download an encrypted backup of your vault as JSON."
              open={open === "export"}
              onToggle={() => toggle("export")}
              actionLabel="Export"
            >
              <form className="stack" onSubmit={(e) => void exportVault(e)}>
                <div className="field">
                  <label htmlFor="export-pw">Master password</label>
                  <input
                    id="export-pw"
                    type="password"
                    required
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                  />
                </div>
                <button className="btn btn-primary" type="submit" style={{ width: "fit-content" }}>
                  Download encrypted backup
                </button>
              </form>
            </SettingRow>

            <SettingRow
              icon={<IconUpload />}
              title="Import vault"
              description="Restore credentials from a previously exported backup file."
              open={open === "import"}
              onToggle={() => toggle("import")}
              actionLabel="Import"
            >
              <form className="stack" onSubmit={(e) => void importVault(e)}>
                <div className="field">
                  <label htmlFor="import-file">Export file</label>
                  <input
                    id="import-file"
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="import-pw">Master password</label>
                  <input
                    id="import-pw"
                    type="password"
                    required
                    value={importPassword}
                    onChange={(e) => setImportPassword(e.target.value)}
                  />
                </div>
                <button className="btn btn-primary" type="submit" style={{ width: "fit-content" }}>
                  Import credentials
                </button>
              </form>
            </SettingRow>
          </div>
        </section>
      </div>
    </div>
  );
}
