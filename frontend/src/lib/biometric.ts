/**
 * WebAuthn biometric helpers (Windows Hello / Touch ID / Face ID).
 * Uses the PRF extension when available to wrap the vault DEK locally.
 */

const BIO_STORAGE_PREFIX = "ks_bio_wrap_";
const PRF_SALT = new TextEncoder().encode("keysafe-vault-prf-v1");

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function b64urlToBuf(b64url: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  return b64ToBuf(b64).buffer;
}

function bufToB64url(buf: ArrayBuffer | Uint8Array): string {
  return bufToB64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function biometricSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

/** True when this device can use biometrics but vault unlock is not set up yet. */
export function needsBiometricSetup(userId: string): boolean {
  if (!biometricSupported()) return false;
  return !loadBioWrap(userId);
}

const BIO_REQUIRED_KEY = "ks_bio_required";
const BIO_SESSION_OK_KEY = "ks_bio_session_ok";

/** After create-account: biometric setup is mandatory before the dashboard. */
export function markBiometricRequired() {
  sessionStorage.setItem(BIO_REQUIRED_KEY, "1");
}

export function clearBiometricRequired() {
  sessionStorage.removeItem(BIO_REQUIRED_KEY);
}

export function isBiometricRequired(): boolean {
  return sessionStorage.getItem(BIO_REQUIRED_KEY) === "1";
}

/** Set after password login + successful biometric confirm/setup this session. */
export function markBiometricSessionOk() {
  sessionStorage.setItem(BIO_SESSION_OK_KEY, "1");
}

export function clearBiometricSessionOk() {
  sessionStorage.removeItem(BIO_SESSION_OK_KEY);
}

export function isBiometricSessionOk(): boolean {
  return sessionStorage.getItem(BIO_SESSION_OK_KEY) === "1";
}

/** Password succeeded and this device already has bio wrap — must confirm before vault. */
export function needsBiometricConfirm(userId: string): boolean {
  if (!biometricSupported()) return false;
  if (!loadBioWrap(userId)) return false;
  return !isBiometricSessionOk();
}

export type BioWrapRecord = {
  userId: string;
  credentialId: string;
  wrappedDek: string;
  nonce: string;
};

export function loadBioWrap(userId: string): BioWrapRecord | null {
  try {
    const raw = localStorage.getItem(BIO_STORAGE_PREFIX + userId);
    if (!raw) return null;
    return JSON.parse(raw) as BioWrapRecord;
  } catch {
    return null;
  }
}

export function clearBioWrap(userId: string) {
  localStorage.removeItem(BIO_STORAGE_PREFIX + userId);
}

/** Remove every local biometric vault wrap (e.g. after master-password reset). */
export function clearAllBioWraps() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(BIO_STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

async function importAesKey(raw: ArrayBuffer): Promise<CryptoKey> {
  const bytes = new Uint8Array(raw);
  const keyBytes = bytes.byteLength >= 32 ? bytes.slice(0, 32) : bytes;
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function wrapDekWithPrfKey(
  dek: Uint8Array,
  prfKeyMaterial: ArrayBuffer,
): Promise<{ wrappedDek: string; nonce: string }> {
  const key = await importAesKey(prfKeyMaterial);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    dek as BufferSource,
  );
  return { wrappedDek: bufToB64(ciphertext), nonce: bufToB64(nonce) };
}

export async function unwrapDekWithPrfKey(
  wrappedDek: string,
  nonceB64: string,
  prfKeyMaterial: ArrayBuffer,
): Promise<Uint8Array> {
  const key = await importAesKey(prfKeyMaterial);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBuf(nonceB64) as BufferSource },
    key,
    b64ToBuf(wrappedDek) as BufferSource,
  );
  return new Uint8Array(plain);
}

/** Convert server PublicKeyCredentialCreationOptions JSON to browser format. */
export function reviveCreationOptions(options: Record<string, unknown>) {
  const user = options.user as Record<string, unknown>;
  const exclude = (options.excludeCredentials as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...options,
    challenge: b64urlToBuf(String(options.challenge)),
    user: {
      ...user,
      id: b64urlToBuf(String(user.id)),
    },
    excludeCredentials: exclude.map((c) => ({
      ...c,
      id: b64urlToBuf(String(c.id)),
    })),
    extensions: {
      ...(options.extensions as object | undefined),
      prf: {},
    },
  } as PublicKeyCredentialCreationOptions;
}

export function reviveRequestOptions(options: Record<string, unknown>) {
  const allow = (options.allowCredentials as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...options,
    challenge: b64urlToBuf(String(options.challenge)),
    allowCredentials: allow.map((c) => ({
      ...c,
      id: b64urlToBuf(String(c.id)),
    })),
    extensions: {
      ...(options.extensions as object | undefined),
      prf: { eval: { first: PRF_SALT } },
    },
  } as unknown as PublicKeyCredentialRequestOptions;
}

export function credentialToJson(cred: PublicKeyCredential): Record<string, unknown> {
  const response = cred.response as AuthenticatorAttestationResponse | AuthenticatorAssertionResponse;
  const base: Record<string, unknown> = {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults(),
  };
  if ("attestationObject" in response) {
    base.response = {
      clientDataJSON: bufToB64url(response.clientDataJSON),
      attestationObject: bufToB64url(response.attestationObject),
      transports:
        typeof (response as AuthenticatorAttestationResponse).getTransports === "function"
          ? (response as AuthenticatorAttestationResponse).getTransports()
          : [],
    };
  } else {
    const assertion = response as AuthenticatorAssertionResponse;
    base.response = {
      clientDataJSON: bufToB64url(assertion.clientDataJSON),
      authenticatorData: bufToB64url(assertion.authenticatorData),
      signature: bufToB64url(assertion.signature),
      userHandle: assertion.userHandle ? bufToB64url(assertion.userHandle) : null,
    };
  }
  return base;
}

export function extractPrfResult(cred: PublicKeyCredential): ArrayBuffer | null {
  const ext = cred.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer }; enabled?: boolean };
  };
  return ext.prf?.results?.first ?? null;
}

export function saveBioWrap(record: BioWrapRecord) {
  localStorage.setItem(BIO_STORAGE_PREFIX + record.userId, JSON.stringify(record));
}

export function hasLocalBioWrap(userId: string): boolean {
  return !!loadBioWrap(userId);
}
