/** KeySafe brand mark — uses /logo.svg (system blue + white). */
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <img
      src="/logo.svg"
      alt=""
      className={className}
      width={32}
      height={32}
      decoding="async"
    />
  );
}
