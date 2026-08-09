/* Brand-aligned avatar accents (primary / secondary / status family). */
const PALETTE = [
  "#2f6fed",
  "#1c4fce",
  "#0d2559",
  "#123a7a",
  "#16a45f",
  "#d97706",
  "#e0293f",
  "#1c9dd6",
];

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function initialsFor(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  label,
  size = 2.1,
}: {
  label: string;
  size?: number;
}) {
  const seed = label || "?";
  return (
    <span
      className="avatar"
      style={{
        background: colorFor(seed),
        width: `${size}rem`,
        height: `${size}rem`,
        fontSize: `${size * 0.36}rem`,
      }}
      aria-hidden
    >
      {initialsFor(seed)}
    </span>
  );
}
