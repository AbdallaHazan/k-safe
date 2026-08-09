/**
 * Maps a vault category to a "suitable" credential form: which fields to
 * show, in what order, and with what labels/placeholders. This keeps the
 * underlying storage generic (title/username/email/password/website/notes/
 * tags ciphertext) while tailoring the editing experience per category.
 */

export type CredentialFieldKey = "username" | "email" | "website" | "notes" | "tags";

export type FieldDescriptor = {
  key: CredentialFieldKey;
  label: string;
  placeholder?: string;
  multiline?: boolean;
};

export type CategoryFormConfig = {
  hint: string;
  titleLabel: string;
  titlePlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder?: string;
  fields: FieldDescriptor[];
};

const DEFAULT_CONFIG: CategoryFormConfig = {
  hint: "General login — fill in whatever applies.",
  titleLabel: "Title",
  titlePlaceholder: "e.g. Gmail",
  passwordLabel: "Password",
  fields: [
    { key: "username", label: "Username or email", placeholder: "you@example.com" },
    { key: "website", label: "Website (optional)", placeholder: "example.com" },
    { key: "notes", label: "Notes (optional)", placeholder: "Anything else worth remembering…", multiline: true },
    { key: "tags", label: "Tags (optional)", placeholder: "comma, separated, tags" },
  ],
};

const CONFIGS: Record<string, CategoryFormConfig> = {
  "social media": {
    hint: "Handle, password, and profile link for a social app.",
    titleLabel: "Platform",
    titlePlaceholder: "e.g. Instagram",
    passwordLabel: "Password",
    fields: [
      { key: "username", label: "Username or handle", placeholder: "@yourhandle" },
      { key: "website", label: "Profile / website", placeholder: "instagram.com" },
    ],
  },
  email: {
    hint: "Mailbox login plus recovery info in case you get locked out.",
    titleLabel: "Provider",
    titlePlaceholder: "e.g. Gmail",
    passwordLabel: "Password",
    fields: [
      { key: "email", label: "Email address", placeholder: "you@example.com" },
      { key: "website", label: "Webmail URL", placeholder: "mail.google.com" },
      {
        key: "notes",
        label: "Recovery info (optional)",
        placeholder: "Recovery phone, backup email, security questions…",
        multiline: true,
      },
    ],
  },
  banking: {
    hint: "Account / card number and PIN — never your full card on the back.",
    titleLabel: "Bank or institution",
    titlePlaceholder: "e.g. Chase",
    passwordLabel: "Password / PIN",
    passwordPlaceholder: "Online banking password or card PIN",
    fields: [
      { key: "username", label: "Account or card number", placeholder: "Account / card number" },
      { key: "website", label: "Online banking URL", placeholder: "chase.com" },
      {
        key: "notes",
        label: "Notes (optional)",
        placeholder: "Routing number, branch, support line…",
        multiline: true,
      },
    ],
  },
  shopping: {
    hint: "Storefront login for faster checkout, safely stored.",
    titleLabel: "Store",
    titlePlaceholder: "e.g. Amazon",
    passwordLabel: "Password",
    fields: [
      { key: "email", label: "Email or username", placeholder: "you@example.com" },
      { key: "website", label: "Website", placeholder: "amazon.com" },
    ],
  },
  work: {
    hint: "Work tool or portal login, with role/notes for context.",
    titleLabel: "Company or tool",
    titlePlaceholder: "e.g. Slack",
    passwordLabel: "Password",
    fields: [
      { key: "username", label: "Username", placeholder: "work username" },
      { key: "website", label: "Website", placeholder: "company.slack.com" },
      { key: "notes", label: "Notes (optional)", placeholder: "Role, team, extension…", multiline: true },
    ],
  },
  education: {
    hint: "School or course platform login with your student ID.",
    titleLabel: "School or platform",
    titlePlaceholder: "e.g. Coursera",
    passwordLabel: "Password",
    fields: [
      { key: "username", label: "Student ID or username", placeholder: "Student ID / username" },
      { key: "website", label: "Website", placeholder: "coursera.org" },
      { key: "notes", label: "Notes (optional)", placeholder: "Class, semester, advisor…", multiline: true },
    ],
  },
  personal: {
    hint: "A personal login that doesn't need a website.",
    titleLabel: "Title",
    titlePlaceholder: "e.g. Diary app",
    passwordLabel: "Password",
    fields: [
      { key: "username", label: "Username (optional)", placeholder: "username" },
      { key: "notes", label: "Notes (optional)", placeholder: "Anything worth remembering…", multiline: true },
    ],
  },
  other: DEFAULT_CONFIG,
};

export function getCategoryFormConfig(categoryName?: string | null): CategoryFormConfig {
  if (!categoryName) return DEFAULT_CONFIG;
  return CONFIGS[categoryName.trim().toLowerCase()] ?? DEFAULT_CONFIG;
}
