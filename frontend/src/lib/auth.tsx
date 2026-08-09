import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, loadStoredTokens, setTokens, setUnauthorizedHandler } from "./api";
import {
  clearBiometricRequired,
  clearBiometricSessionOk,
} from "./biometric";
import {
  decryptField,
  prepareRegistrationCrypto,
  unlockVault,
} from "./crypto";
import type { LoginResponse, User } from "./types";

type Pending2FA = {
  email: string;
  /** Present for password login; absent for biometric → 2FA. */
  masterPassword?: string;
  /** Present for biometric login; vault is already unwrapped locally. */
  dek?: Uint8Array;
  preAuthToken: string;
};

type AuthContextValue = {
  user: User | null;
  dek: Uint8Array | null;
  ready: boolean;
  pending2fa: Pending2FA | null;
  idleLockMinutes: number;
  register: (input: {
    name: string;
    email: string;
    masterPassword: string;
  }) => Promise<void>;
  login: (email: string, masterPassword: string) => Promise<"ok" | "2fa">;
  verify2fa: (emailCode: string) => Promise<void>;
  logout: () => Promise<void>;
  lockVault: () => void;
  touchActivity: () => void;
  refreshUser: () => Promise<void>;
  decrypt: (blob: string) => Promise<string>;
  getDek: () => Uint8Array;
  applyBiometricSession: (
    tokens: { access: string; refresh: string },
    sessionUser: User,
    vaultDek: Uint8Array,
    idleMinutes?: number,
  ) => Promise<void>;
  /** Hold an unwrapped DEK while email 2FA completes after biometric proof. */
  beginBiometric2fa: (input: {
    email: string;
    preAuthToken: string;
    dek: Uint8Array;
    idleMinutes?: number;
  }) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_IDLE_MINUTES = 15;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [dek, setDek] = useState<Uint8Array | null>(null);
  const [ready, setReady] = useState(false);
  const [pending2fa, setPending2fa] = useState<Pending2FA | null>(null);
  const [idleLockMinutes, setIdleLockMinutes] = useState(DEFAULT_IDLE_MINUTES);
  const lastActivityRef = useRef(Date.now());
  const dekRef = useRef<Uint8Array | null>(null);

  const clearSession = useCallback(() => {
    setTokens(null);
    setUser(null);
    setDek(null);
    dekRef.current = null;
    setPending2fa(null);
    clearBiometricSessionOk();
    clearBiometricRequired();
  }, []);

  const lockVault = useCallback(() => {
    // Keep JWT? No — full lock requires re-entry of master password.
    clearSession();
  }, [clearSession]);

  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => clearSession());
    // Tokens alone are not enough — DEK is memory-only, so refresh requires login.
    const tokens = loadStoredTokens();
    if (tokens) {
      setTokens(null);
    }
    setReady(true);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    const onActivity = () => {
      if (dekRef.current) touchActivity();
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true });

    const timer = window.setInterval(() => {
      if (!dekRef.current) return;
      const idleMs = idleLockMinutes * 60 * 1000;
      if (Date.now() - lastActivityRef.current > idleMs) {
        lockVault();
      }
    }, 15_000);

    return () => {
      for (const ev of events) window.removeEventListener(ev, onActivity);
      window.clearInterval(timer);
    };
  }, [idleLockMinutes, lockVault, touchActivity]);

  const applyUnlockedSession = useCallback(
    async (
      tokens: { access: string; refresh: string },
      sessionUser: User & {
        encrypted_vault_key: string;
        vault_key_nonce: string;
      },
      masterPassword: string,
      idleMinutes?: number,
    ) => {
      setTokens(tokens);
      clearBiometricSessionOk();
      const vaultDek = await unlockVault(
        masterPassword,
        sessionUser.kdf_salt,
        sessionUser.encrypted_vault_key,
        sessionUser.vault_key_nonce,
      );
      dekRef.current = vaultDek;
      setDek(vaultDek);
      setUser(sessionUser);
      setPending2fa(null);
      if (idleMinutes) setIdleLockMinutes(idleMinutes);
      touchActivity();
    },
    [touchActivity],
  );

  const register = useCallback(
    async (input: { name: string; email: string; masterPassword: string }) => {
      const cryptoMaterial = await prepareRegistrationCrypto(input.masterPassword);
      const res = await api.post<{
        tokens: { access: string; refresh: string };
        user: User & {
          encrypted_vault_key: string;
          vault_key_nonce: string;
        };
        vault_idle_lock_minutes?: number;
      }>(
        "/api/register",
        {
          name: input.name,
          email: input.email,
          master_password: input.masterPassword,
          kdf_salt: cryptoMaterial.kdfSalt,
          encrypted_vault_key: cryptoMaterial.encryptedVaultKey,
          vault_key_nonce: cryptoMaterial.vaultKeyNonce,
        },
        false,
      );
      // Onboarding session only — pending users cannot use /api/login until biometric is on.
      await applyUnlockedSession(
        res.tokens,
        res.user,
        input.masterPassword,
        res.vault_idle_lock_minutes,
      );
    },
    [applyUnlockedSession],
  );

  const login = useCallback(
    async (email: string, masterPassword: string): Promise<"ok" | "2fa"> => {
      const res = await api.post<LoginResponse>(
        "/api/login",
        { email, master_password: masterPassword },
        false,
      );

      if (res.requires_2fa) {
        setPending2fa({
          email: res.user.email,
          masterPassword,
          preAuthToken: res.pre_auth_token,
        });
        if (res.vault_idle_lock_minutes) {
          setIdleLockMinutes(res.vault_idle_lock_minutes);
        }
        return "2fa";
      }

      await applyUnlockedSession(
        res.tokens,
        res.user,
        masterPassword,
        res.vault_idle_lock_minutes,
      );
      return "ok";
    },
    [applyUnlockedSession],
  );

  const verify2fa = useCallback(
    async (emailCode: string) => {
      if (!pending2fa) throw new Error("No pending 2FA challenge");
      const res = await api.post<{
        tokens: { access: string; refresh: string };
        user: User & {
          encrypted_vault_key: string;
          vault_key_nonce: string;
        };
        vault_idle_lock_minutes?: number;
      }>(
        "/api/verify-2fa",
        {
          email: pending2fa.email,
          pre_auth_token: pending2fa.preAuthToken,
          email_code: emailCode,
        },
        false,
      );

      if (pending2fa.dek) {
        setTokens(res.tokens);
        dekRef.current = pending2fa.dek;
        setDek(pending2fa.dek);
        setUser(res.user);
        setPending2fa(null);
        if (res.vault_idle_lock_minutes) {
          setIdleLockMinutes(res.vault_idle_lock_minutes);
        }
        touchActivity();
        return;
      }

      if (!pending2fa.masterPassword) {
        throw new Error("Missing master password for vault unlock");
      }
      await applyUnlockedSession(
        res.tokens,
        res.user,
        pending2fa.masterPassword,
        res.vault_idle_lock_minutes,
      );
    },
    [applyUnlockedSession, pending2fa, touchActivity],
  );

  const logout = useCallback(async () => {
    try {
      const refresh = sessionStorage.getItem("ks_refresh");
      if (refresh) await api.post("/api/logout", { refresh });
    } catch {
      // ignore
    }
    clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const profile = await api.get<User & { vault_idle_lock_minutes?: number }>(
      "/api/profile",
    );
    setUser(profile);
    if (profile.vault_idle_lock_minutes) {
      setIdleLockMinutes(profile.vault_idle_lock_minutes);
    }
  }, []);

  const decrypt = useCallback(async (blob: string) => {
    if (!dekRef.current) throw new Error("Vault is locked");
    return decryptField(blob, dekRef.current);
  }, []);

  const getDek = useCallback(() => {
    if (!dekRef.current) throw new Error("Vault is locked");
    return dekRef.current;
  }, []);

  const applyBiometricSession = useCallback(
    async (
      tokens: { access: string; refresh: string },
      sessionUser: User,
      vaultDek: Uint8Array,
      idleMinutes?: number,
    ) => {
      setTokens(tokens);
      dekRef.current = vaultDek;
      setDek(vaultDek);
      setUser(sessionUser);
      setPending2fa(null);
      if (idleMinutes) setIdleLockMinutes(idleMinutes);
      touchActivity();
    },
    [touchActivity],
  );

  const beginBiometric2fa = useCallback(
    (input: {
      email: string;
      preAuthToken: string;
      dek: Uint8Array;
      idleMinutes?: number;
    }) => {
      setPending2fa({
        email: input.email,
        preAuthToken: input.preAuthToken,
        dek: input.dek,
      });
      if (input.idleMinutes) setIdleLockMinutes(input.idleMinutes);
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      dek,
      ready,
      pending2fa,
      idleLockMinutes,
      register,
      login,
      verify2fa,
      logout,
      lockVault,
      touchActivity,
      refreshUser,
      decrypt,
      getDek,
      applyBiometricSession,
      beginBiometric2fa,
    }),
    [
      user,
      dek,
      ready,
      pending2fa,
      idleLockMinutes,
      register,
      login,
      verify2fa,
      logout,
      lockVault,
      touchActivity,
      refreshUser,
      decrypt,
      getDek,
      applyBiometricSession,
      beginBiometric2fa,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
