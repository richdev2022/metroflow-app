/**
 * MetriCorex brand mark — the gradient tile + sparkles glyph used on the
 * marketing site header. Single source of truth for the logo across the app
 * (replaces the old /Assets/logo.png raster everywhere).
 */
export function BrandMark({
  size = 40,
  className = "",
  radius = 0.24,
}: {
  size?: number;
  className?: string;
  radius?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="mc-brand-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx={64 * radius} fill="url(#mc-brand-g)" />
      <g transform="translate(20,20)" fill="#ffffff">
        <path
          d="M12.9 19.4a2.5 2.5 0 0 0-1.8-1.8l-7.7-2a.6.6 0 0 1 0-1.2l7.7-2a2.5 2.5 0 0 0 1.8-1.8l2-7.7a.6.6 0 0 1 1.2 0l2 7.7a2.5 2.5 0 0 0 1.8 1.8l7.7 2a.6.6 0 0 1 0 1.2l-7.7 2a2.5 2.5 0 0 0-1.8 1.8l-2 7.7a.6.6 0 0 1-1.2 0z"
          transform="scale(0.92) translate(-1.5,-1.5)"
        />
        <rect x="21.5" y="1.5" width="2.6" height="8" rx="1.3" />
        <rect x="18.8" y="4.2" width="8" height="2.6" rx="1.3" />
        <rect x="2.2" y="20.5" width="2.2" height="6.4" rx="1.1" />
        <rect x="0.9" y="22.6" width="4.8" height="2.2" rx="1.1" />
      </g>
    </svg>
  );
}

export function BrandLogo({
  size = 40,
  showWordmark = true,
  wordmarkClassName = "text-lg font-bold tracking-tight text-foreground",
  className = "",
}: {
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} />
      {showWordmark && <span className={wordmarkClassName}>MetriCorex</span>}
    </span>
  );
}
