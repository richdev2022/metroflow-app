/**
 * MetriCorex brand mark — the blue gradient SHIELD with growth bars + arrow
 * (/Assets/logo-mark.png). Single source of truth for the logo across the app.
 * The full-color shield works on both light and dark backgrounds.
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
    <img
      src="/Assets/logo-mark.png"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, objectFit: "contain" }}
      alt="Metricorex"
    />
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
