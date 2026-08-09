import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function IconDashboard(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="7.5" height="8.5" rx="1.6" />
      <rect x="13" y="3.5" width="7.5" height="5" rx="1.6" />
      <rect x="13" y="11" width="7.5" height="9.5" rx="1.6" />
      <rect x="3.5" y="14.5" width="7.5" height="6" rx="1.6" />
    </svg>
  );
}

export function IconVault(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="4" width="17" height="16" rx="2.2" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 8.6v1.4M12 14v1.4M8.6 12H10M14 12h1.4" />
    </svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4.2l1.8 2.2h8a1.5 1.5 0 0 1 1.5 1.5v9.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.4 5 6v6.1c0 4.4 3 7.1 7 8.5 4-1.4 7-4.1 7-8.5V6z" />
      <path d="M9.2 12.2 11.3 14.3 15.1 10" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.6v2.2M12 18.2v2.2M5.2 6.5l1.6 1.6M17.2 15.9l1.6 1.6M3.6 12h2.2M18.2 12h2.2M5.2 17.5l1.6-1.6M17.2 8.1l1.6-1.6" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8.2" r="3" />
      <path d="M3.5 19c0-2.9 2.5-5 5.5-5s5.5 2.1 5.5 5" />
      <path d="M16 8.2a2.8 2.8 0 1 1 0-5.6M20.5 19c0-2.4-1.7-4.3-4-4.8" />
    </svg>
  );
}

export function IconOverview(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 13.5 9 8l4 3.5 7-7" />
      <path d="M15 4.5h5v5" />
      <path d="M4 19.5h16" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9.5 12 15l6-5.5" />
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.8 19.5c0-3.6 3.2-6.2 7.2-6.2s7.2 2.6 7.2 6.2" />
    </svg>
  );
}

export function IconFingerprint(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.6c-4.6 0-8.3 3.7-8.3 8.3 0 1.7.2 3 .5 4" />
      <path d="M12 3.6c4.6 0 8.3 3.7 8.3 8.3 0 1-.1 2.1-.4 3.2" />
      <path d="M7.5 20c-.6-1.4-1-3.4-1-5.8a5.5 5.5 0 1 1 11 0c0 .5 0 1-.1 1.5" />
      <path d="M9.8 20.4c-.7-1.7-1.1-3.9-1.1-6.2a3.3 3.3 0 1 1 6.6 0c0 .4 0 .8-.1 1.2" />
      <path d="M12.7 20.6c-.5-1-.9-2.6-1-4.3" />
    </svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="7.5" cy="14.5" r="3.6" />
      <path d="M9.9 12.1 18 4M15.4 6.5l2.2 2.2M18 4l2 2" />
    </svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4.5 7 12 12.8 19.5 7" />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4v11" />
      <path d="M7.5 11.5 12 16l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 20V9" />
      <path d="M7.5 13.5 12 9l4.5 4.5" />
      <path d="M4.5 19.5h15" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 7h15" />
      <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" />
      <path d="M6.5 7 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4A1.5 1.5 0 0 0 16.7 19L17.5 7" />
      <path d="M10.2 11v5.4M13.8 11v5.4" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 4.5 20 19.5" />
      <path d="M9.5 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.8-1.9" />
      <path d="M6.2 6.8C4.1 8.2 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.4 4.5-1" />
      <path d="M11.2 5.6c.3 0 .5-.1.8-.1 6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.2 2.7" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.8A2.3 2.3 0 0 0 13.2 4.5H6.8A2.3 2.3 0 0 0 4.5 6.8v6.4A2.3 2.3 0 0 0 6.8 15.5H8.5" />
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 19.5h4L19 9l-4-4L4.5 15.5z" />
      <path d="M13.2 6.8 17.2 10.8" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.2 16.2 20 20" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5s-1.2 5.9-3.6 8.5M12 3.5C9.6 6.1 8.4 8.9 8.4 12s1.2 5.9 3.6 8.5" />
    </svg>
  );
}
