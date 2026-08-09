export type User = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  two_factor_enabled: boolean;
  biometric_enabled: boolean;
  email_verified: boolean;
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  kdf_salt: string;
  encrypted_vault_key?: string;
  vault_key_nonce?: string;
  vault_idle_lock_minutes?: number;
};

export type UserLifecycleStatus =
  | "pending"
  | "active"
  | "locked"
  | "inactive";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  status: UserLifecycleStatus;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  two_factor_enabled: boolean;
  biometric_enabled: boolean;
  email_verified: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  credential_count: number;
  category_count: number;
  login_history?: Array<{
    id: string;
    ip_address: string | null;
    user_agent: string;
    success: boolean;
    failure_reason: string;
    created_at: string;
  }>;
};

export type AdminStats = {
  users_total: number;
  users_pending: number;
  users_active: number;
  users_locked: number;
  users_inactive: number;
  users_staff: number;
  credentials_total: number;
  categories_total: number;
  recent_security_logs: Array<{
    id: string;
    action: string;
    user_email: string | null;
    ip_address: string | null;
    created_at: string;
  }>;
  recent_failed_logins: Array<{
    id: string;
    user_email: string;
    ip_address: string | null;
    failure_reason: string;
    created_at: string;
  }>;
};

export type Category = {
  id: string;
  name: string;
  is_default: boolean;
  credential_count?: number;
  created_at: string;
  updated_at: string;
};

export type CredentialCipher = {
  id: string;
  category: string | null;
  category_id: string | null;
  encrypted_title: string;
  encrypted_username: string;
  encrypted_email: string;
  encrypted_password: string;
  encrypted_notes: string;
  encrypted_tags: string;
  encrypted_website: string;
  website_host: string;
  password_strength: number;
  password_changed_at: string | null;
  is_favorite?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type CredentialListItem = {
  id: string;
  category_id: string | null;
  encrypted_title: string;
  encrypted_username: string;
  encrypted_email: string;
  encrypted_password: string;
  encrypted_website: string;
  website_host: string;
  password_strength: number;
  is_favorite?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type DecryptedCredential = {
  id: string;
  categoryId: string | null;
  title: string;
  username: string;
  email: string;
  password: string;
  notes: string;
  tags: string;
  websiteUrl: string;
  websiteHost: string;
  passwordStrength: number;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  deletedAt?: string | null;
};

export type SecurityScore = {
  score: number;
  total_credentials: number;
  weak_passwords: number;
  medium_passwords: number;
  strong_passwords: number;
  two_factor_enabled: boolean;
  unused_recovery_codes: number;
  deductions: { code: string; message: string; penalty: number }[];
};

export type DashboardStats = {
  welcome_name: string;
  total_accounts: number;
  total_categories: number;
  security_score: number;
  recent_credentials: {
    id: string;
    encrypted_title: string;
    category_id: string | null;
    website_host: string;
    created_at: string;
    updated_at: string;
  }[];
  recent_activity: {
    id: string;
    action: string;
    timestamp: string;
  }[];
};

export type LoginResponse =
  | {
      requires_2fa: false;
      tokens: { access: string; refresh: string };
      user: User & {
        encrypted_vault_key: string;
        vault_key_nonce: string;
      };
      vault_idle_lock_minutes?: number;
    }
  | {
      requires_2fa: true;
      pre_auth_token: string;
      user: {
        id: string;
        email: string;
        name: string;
      };
      vault_idle_lock_minutes?: number;
    };
