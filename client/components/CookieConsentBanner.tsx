import { useEffect, useState } from "react";

const CONSENT_KEY = "metricorex:cookie-consent";

export type CookieConsent = "accepted" | "rejected";

export function getStoredCookieConsent(): CookieConsent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Cookie consent banner — shown to every first-time visitor until they accept
 * or reject. Metricorex only uses strictly-necessary local storage (session,
 * theme, preferences) plus optional analytics; rejecting keeps analytics off
 * while keeping the app functional.
 */
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Small delay so the banner never flashes over the first paint.
    const t = setTimeout(() => {
      if (getStoredCookieConsent() === null) setVisible(true);
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const decide = (value: CookieConsent) => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
      localStorage.setItem(`${CONSENT_KEY}:at`, new Date().toISOString());
    } catch {
      /* storage unavailable — remember for this page view only */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-3 sm:px-5 sm:pb-5"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-2xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">We value your privacy</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Metricorex uses essential cookies and local storage to keep you signed in and remember
            your preferences, plus optional analytics to improve the app for both Personal and
            Business users. Choose “Accept” to allow all, or “Reject” to keep only the essentials.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
          <button
            onClick={() => decide("accepted")}
            className="min-w-[110px] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Accept
          </button>
          <button
            onClick={() => decide("rejected")}
            className="min-w-[110px] rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
