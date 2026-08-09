/**
 * Client-side zero-knowledge crypto for KeySafe.
 *
 * Wire format for vault fields (base64):
 *   nonce (12 bytes) || ciphertext || tag (16 bytes)
 *
 * Master password flow:
 * 1. Generate random DEK (32 bytes)
 * 2. Derive wrap key via Argon2id(masterPassword, kdfSalt)
 * 3. Wrap DEK with AES-256-GCM → encrypted_vault_key + vault_key_nonce
 * 4. Encrypt all credential fields with DEK before sending to API
 */

import { argon2id } from "hash-wasm";

const NONCE_SIZE = 12;
const KEY_SIZE = 32;
const ARGON2_MEMORY = 19 * 1024; // ~19 MB — browser-friendly (OWASP minimum class)
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;

function bufToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

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

export function generateSaltHex(bytes = 16): string {
  return bufToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function generateDek(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(KEY_SIZE));
}

export async function deriveWrapKey(
  masterPassword: string,
  saltHex: string,
): Promise<CryptoKey> {
  const hash = await argon2id({
    password: masterPassword,
    salt: hexToBuf(saltHex),
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: "binary",
  });

  return crypto.subtle.importKey(
    "raw",
    hash as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapDek(
  dek: Uint8Array,
  wrapKey: CryptoKey,
): Promise<{ encryptedVaultKey: string; vaultKeyNonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    wrapKey,
    dek as BufferSource,
  );
  return {
    encryptedVaultKey: bufToB64(ciphertext),
    vaultKeyNonce: bufToHex(nonce),
  };
}

export async function unwrapDek(
  encryptedVaultKey: string,
  vaultKeyNonce: string,
  wrapKey: CryptoKey,
): Promise<Uint8Array> {
  const nonce = hexToBuf(vaultKeyNonce);
  const ciphertext = b64ToBuf(encryptedVaultKey);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce as BufferSource },
    wrapKey,
    ciphertext as BufferSource,
  );
  return new Uint8Array(plain);
}

async function importDek(dek: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    dek as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt plaintext → base64(nonce || ciphertext||tag) matching server helpers. */
export async function encryptField(
  plaintext: string,
  dek: Uint8Array,
): Promise<string> {
  if (!plaintext) return "";
  const key = await importDek(dek);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  return bufToB64(combined);
}

export async function decryptField(
  blob: string,
  dek: Uint8Array,
): Promise<string> {
  if (!blob) return "";
  const key = await importDek(dek);
  const raw = b64ToBuf(blob);
  if (raw.length < NONCE_SIZE + 16) {
    throw new Error("Ciphertext blob is too short");
  }
  const nonce = raw.slice(0, NONCE_SIZE);
  const ciphertext = raw.slice(NONCE_SIZE);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plain);
}

export async function prepareRegistrationCrypto(masterPassword: string) {
  const kdfSalt = generateSaltHex(16);
  const dek = generateDek();
  const wrapKey = await deriveWrapKey(masterPassword, kdfSalt);
  const { encryptedVaultKey, vaultKeyNonce } = await wrapDek(dek, wrapKey);
  return {
    kdfSalt,
    encryptedVaultKey,
    vaultKeyNonce,
    dek,
  };
}

export async function unlockVault(
  masterPassword: string,
  kdfSalt: string,
  encryptedVaultKey: string,
  vaultKeyNonce: string,
): Promise<Uint8Array> {
  const wrapKey = await deriveWrapKey(masterPassword, kdfSalt);
  return unwrapDek(encryptedVaultKey, vaultKeyNonce, wrapKey);
}

/** Simple local password strength 0–100 for security score reporting. */
export function scorePasswordStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 15;
  if (password.length >= 12) score += 15;
  if (password.length >= 16) score += 10;
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/\d/.test(password)) score += 10;
  if (/[^A-Za-z0-9]/.test(password)) score += 15;
  const unique = new Set(password).size;
  if (unique >= 8) score += 10;
  if (unique >= 12) score += 5;
  return Math.min(100, score);
}

/** Extract hostname for non-secret server-side filtering. */
export function extractWebsiteHost(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Find passwords reused across decrypted vault entries. */
export function findReusedPasswords(
  entries: { id: string; title: string; password: string }[],
): { password: string; titles: string[]; ids: string[] }[] {
  const map = new Map<string, { titles: string[]; ids: string[] }>();
  for (const entry of entries) {
    if (!entry.password) continue;
    const bucket = map.get(entry.password) ?? { titles: [], ids: [] };
    bucket.titles.push(entry.title || "Untitled");
    bucket.ids.push(entry.id);
    map.set(entry.password, bucket);
  }
  return [...map.entries()]
    .filter(([, v]) => v.ids.length > 1)
    .map(([password, v]) => ({ password, ...v }));
}
