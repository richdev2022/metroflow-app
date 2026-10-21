/**
 * Cross-app SSO bridge — Business <-> Personal.
 *
 * Both apps share one credential set and one backend. With a local session
 * token, minting a one-time SSO ticket (POST /auth/sso/ticket) hands the
 * signed-in session to the other app without re-typing the password; without
 * a token we simply land on the other app's login page.
 *
 * Mirrors metricorex-personal-web/client/lib/cross-app.ts (target swapped).
 */

const BUSINESS_APP_URL =
  (import.meta.env.VITE_APP_URL as string | undefined) || "https://app.metricorex.com";
const PERSONAL_APP_URL =
  (import.meta.env.VITE_PERSONAL_APP_URL as string | undefined) || "https://personal.metricorex.com";

export type CrossAppTarget = "personal" | "business";

/** Only allow same-origin in-app paths — never an off-site redirect. */
export function resolveNextPath(next: string | null | undefined, fallback = "/home"): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return fallback;
}

/** Full URL for the target app — with an SSO ticket when signed in. */
export async function crossAppUrl(target: CrossAppTarget, next = "/home"): Promise<string> {
  const base = target === "personal" ? PERSONAL_APP_URL : BUSINESS_APP_URL;
  const nextPath = resolveNextPath(next, target === "personal" ? "/home" : "/dashboard");
  const token = localStorage.getItem("token");
  if (!token) return `${base}/login`;

  try {
    const res = await fetch(
      `${(import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "")}/auth/sso/ticket`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-business-id": localStorage.getItem("businessId") || "",
          "x-user-id": localStorage.getItem("userId") || "",
        },
        body: JSON.stringify({ purpose: target, next: nextPath }),
      },
    );
    const body = await res.json().catch(() => null);
    const redirect = body?.data?.redirect_url || body?.redirect_url;
    if (res.ok && redirect) return redirect;
  } catch {
    /* fall through to the plain login link */
  }
  return `${base}/login`;
}

/** Navigate the current tab to the other app. */
export async function openCrossApp(target: CrossAppTarget, next = "/home"): Promise<void> {
  window.location.href = await crossAppUrl(target, next);
}
