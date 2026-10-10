/**
 * Media URL resolution helpers.
 *
 * Chat attachment URLs (voice notes, images, files) can come back from the
 * backend in several shapes depending on deployment / storage provider:
 *
 *  - Absolute URLs:  https://api.metricorex.com/uploads/chat/xxx.webm
 *                    https://pub-xxx.r2.dev/chat/xxx.webm   (R2 public URL)
 *  - Root-relative:  /uploads/chat/xxx.webm
 *  - API-relative:   /api/uploads/chat/xxx.webm   (legacy local-storage path)
 *
 * The webapp and the API are served from DIFFERENT origins in production
 * (app on Netlify, API on api.metricorex.com), so a root-relative URL pasted
 * into an <audio>/<img> tag resolves against the app origin and 404s — that is
 * exactly why voice notes "recorded fine but never played". resolveMediaUrl()
 * rewrites root-relative URLs against the configured API origin instead.
 */

/** Reads the configured API base URL (mirrors client/lib/api-client.ts). */
function getApiBaseUrl(): string {
  try {
    return (import.meta.env.VITE_API_BASE_URL || "/api").trim();
  } catch {
    return "/api";
  }
}

/**
 * Derives the API ORIGIN from the configured base URL, stripping any trailing
 * "/api" segment: "https://api.metricorex.com/api" -> "https://api.metricorex.com".
 * Falls back to window.location.origin when the base URL is relative (dev proxy).
 */
export function getApiOrigin(): string {
  const base = getApiBaseUrl();
  if (/^https?:\/\//i.test(base)) {
    try {
      const parsed = new URL(base);
      // Strip a trailing /api (or /api/) path segment.
      const trimmedPath = parsed.pathname.replace(/\/api\/?$/i, "");
      return `${parsed.protocol}//${parsed.host}${trimmedPath === "/" ? "" : trimmedPath}`;
    } catch {
      /* malformed absolute URL — fall through */
    }
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

/**
 * Resolves a chat-attachment / media URL to a playable absolute URL.
 *
 * - http(s), blob:, data: and protocol-relative URLs are returned unchanged.
 * - Root-relative URLs ("/uploads/...", "/api/uploads/...") are prefixed with
 *   the API origin (with a leading "/api" stripped so we never double-prefix).
 * - Empty / non-string input resolves to "" (renders as "no attachment").
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Already absolute (includes blob:/data: created locally for optimistic UI).
  if (/^(https?:|blob:|data:)/i.test(trimmed)) return trimmed;
  // Protocol-relative "//host/path" — browsers resolve scheme fine as-is.
  if (trimmed.startsWith("//")) return trimmed;

  if (trimmed.startsWith("/")) {
    // Strip a legacy "/api" prefix so /api/uploads/x -> /uploads/x, then
    // resolve against the API origin.
    const stripped = trimmed.replace(/^\/api(?=\/)/i, "");
    return `${getApiOrigin()}${stripped}`;
  }

  // Bare relative values. Two shapes exist:
  //  - "uploads/x.webm" — legacy local-disk media → root-relative on the API origin.
  //  - bare object keys ("recordings/<biz>/<id>.mp4", "chat/...", "metricai/...")
  //    returned by R2/egress uploads — these are NOT URLs; they must go through
  //    the API's public /files/<key> streaming route (same normalization the
  //    backend applies to chat media).
  const bare = trimmed.replace(/^\.?\//, "");
  if (/^uploads\//i.test(bare)) {
    return `${getApiOrigin()}/${bare}`;
  }
  return `${getApiOrigin()}/files/${bare}`;
}

/**
 * Builds the ordered list of URL variants to try when loading a media asset:
 * the resolved absolute URL first, then defensive alternates (with the "/api"
 * prefix stripped or added) in case the deployment serves uploads under a
 * different path convention. Duplicates are removed, blob:/data: URLs yield a
 * single-entry list (there is nothing else to try).
 */
export function getMediaSourceCandidates(url?: string | null): string[] {
  if (!url || typeof url !== "string") return [];
  const trimmed = url.trim();
  if (!trimmed) return [];

  const primary = resolveMediaUrl(trimmed);
  const candidates: string[] = [];

  const push = (candidate?: string | null) => {
    if (!candidate) return;
    if (!candidates.includes(candidate)) candidates.push(candidate);
  };

  push(primary);

  // Only derive alternates for path-absolute sources — blob:/data:/absolute
  // http URLs have no meaningful "/api" variants to try.
  if (trimmed.startsWith("/")) {
    const stripped = trimmed.replace(/^\/api(?=\/)/i, "");
    if (/^https?:\/\//i.test(primary)) {
      // Alternate 1: same origin + "/api" added (legacy proxied uploads).
      try {
        const parsed = new URL(primary);
        push(`${parsed.origin}/api${parsed.pathname}${parsed.search}`);
      } catch { /* ignore */ }
      // Alternate 2: raw app-relative form (same origin as the SPA).
      if (typeof window !== "undefined" && window.location?.origin) {
        try {
          const parsed = new URL(primary);
          if (parsed.origin !== window.location.origin) {
            push(`${window.location.origin}${parsed.pathname}${parsed.search}`);
          }
        } catch { /* ignore */ }
      }
    } else if (stripped !== trimmed) {
      // primary was window-origin based; the "/api"-prefixed variant may exist.
      push(`${getApiOrigin()}${trimmed}`);
    }
  }

  return candidates;
}
