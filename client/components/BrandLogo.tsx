/**
 * MetriCorex brand mark — the blue gradient SHIELD with growth bars + arrow
 * (/Assets/logo-mark.png). Single source of truth for the logo across the app.
 * The full-color shield works on both light and dark backgrounds.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { resolveMediaUrl } from "@/lib/media-url";

/**
 * WORKSPACE LOGO (SSO logo parity fix): renders the BUSINESS logo uploaded
 * via the SSO complete-profile screen (businesses.logo_url, exposed by
 * GET /settings as settings.logo_url). Falls back to the static brand mark
 * whenever there is no token, no logo or the logo fails to load — so
 * unauthenticated surfaces keep the plain MetriCorex shield.
 */
export function WorkspaceLogo({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!localStorage.getItem("token")) return;
    api
      .get("/settings")
      .then((res) => {
        if (cancelled) return;
        const settings = res?.data?.settings || res?.data?.data || {};
        const raw = settings?.logo_url || settings?.logoUrl;
        if (raw && typeof raw === "string" && raw.trim() !== "") {
          setLogoUrl(resolveMediaUrl(raw));
        }
      })
      .catch(() => {
        /* non-fatal — keep the static brand mark */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!logoUrl || broken) {
    return <BrandMark size={size} className={className} />;
  }
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, objectFit: "contain", borderRadius: size * 0.24 }}
      alt="Workspace logo"
      onError={() => setBroken(true)}
    />
  );
}

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
