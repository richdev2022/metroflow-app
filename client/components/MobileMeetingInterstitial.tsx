import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Smartphone, Globe, Apple, PlayCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";

/**
 * Mobile meeting-link interstitial.
 *
 * Meeting links (https://app.metricorex.com/meetings/<code>) are opened in a
 * PHONE BROWSER most of the time — tapping "Join" there drops users into a
 * cramped web room when they should use the app. This screen shows:
 *   1. "Open in the app"  — tries metricorex:// then the Android intent://
 *      fallback; if neither fires within 2.5s (app not installed), we surface
 *      the store buttons.
 *   2. "Continue on the web" — renders the normal join flow.
 *   3. Store download buttons fed by the admin-configured links
 *      (GET /api/public/app-links → system_settings app_store_url /
 *      play_store_url, falling back to the newest app release store_url).
 *
 * Desktop browsers never see this — they go straight to the web flow.
 */

const isMobileDevice = () =>
  typeof navigator !== "undefined" &&
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    // iPadOS 13+ masquerades as desktop Safari
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const isAndroid = () => /Android/i.test(navigator.userAgent || "");
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const ANDROID_PACKAGE = "com.metricorex.app";
const APP_SCHEME = "metricorex";

interface StoreLinks {
  app_store_url: string | null;
  play_store_url: string | null;
}

export function useStoreLinks() {
  const [links, setLinks] = useState<StoreLinks>({ app_store_url: null, play_store_url: null });
  useEffect(() => {
    let alive = true;
    api
      .get("/public/app-links")
      .then((res: any) => {
        if (!alive) return;
        const data = res?.data?.data || res?.data || {};
        setLinks({
          app_store_url: data.app_store_url || null,
          play_store_url: data.play_store_url || null,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return links;
}

export function DownloadAppButtons({ links, className }: { links: StoreLinks; className?: string }) {
  const hasLinks = !!(links.app_store_url || links.play_store_url);
  if (!hasLinks) {
    // No store link configured yet — show Coming soon placeholders so the
    // download option never just disappears.
    return (
      <div className={`flex flex-col gap-2 sm:flex-row ${className || ""}`}>
        <span className="flex flex-1 items-center justify-center gap-2 rounded-xl border bg-white/10 px-5 py-3 text-sm font-semibold text-white/70">
          <PlayCircle className="h-5 w-5" />
          Google Play — coming soon
        </span>
        <span className="flex flex-1 items-center justify-center gap-2 rounded-xl border bg-white/10 px-5 py-3 text-sm font-semibold text-white/70">
          <Apple className="h-5 w-5" />
          App Store — coming soon
        </span>
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-2 sm:flex-row ${className || ""}`}>
      {links.play_store_url && (
        <a
          href={links.play_store_url}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/85"
        >
          <PlayCircle className="h-5 w-5" />
          Get it on Google Play
        </a>
      )}
      {links.app_store_url && (
        <a
          href={links.app_store_url}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/85"
        >
          <Apple className="h-5 w-5" />
          Download on the App Store
        </a>
      )}
    </div>
  );
}

export default function MobileMeetingInterstitial({
  meetingCode,
  children,
}: {
  meetingCode: string;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const [isMobile] = useState(isMobileDevice);
  const [continueOnWeb, setContinueOnWeb] = useState(false);
  const [showStores, setShowStores] = useState(false);
  const [launching, setLaunching] = useState(false);
  const links = useStoreLinks();

  useEffect(() => {
    if (!isMobile) return;
    // Deep-link attempt already fired? Don't auto-fire twice on re-render.
    if (continueOnWeb || showStores || launching) return;
    setLaunching(true);
    const deepLink = `${APP_SCHEME}://meetings/${encodeURIComponent(meetingCode)}`;
    const started = Date.now();
    let storeTimer: number | undefined;

    const visibilityHandler = () => {
      // If the app took over, the browser tab goes hidden — success, stop.
      if (document.hidden) {
        if (storeTimer) window.clearTimeout(storeTimer);
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    try {
      if (isAndroid()) {
        // intent:// launches the app when installed and falls back to the
        // browser otherwise — the most reliable Android path in full Chrome.
        const intentUrl =
          `intent://meetings/${encodeURIComponent(meetingCode)}#Intent;` +
          `scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(location.pathname)};end`;
        window.location.href = intentUrl;
        // WebView-type browsers (WhatsApp/Telegram/Instagram in-app, some OEM
        // shells) BLOCK intent:// and custom-scheme navigations — the tab
        // either does nothing or errors with the browser's own "page not
        // found". If we are still visible after 1.2s, try the https
        // UNIVERSAL link: the Android app registers an App Links
        // intent-filter for app.metricorex.com, so this resolves even where
        // intent:// is stripped.
        window.setTimeout(() => {
          if (!document.hidden && !continueOnWeb && !showStores) {
            try {
              window.location.href = `https://app.metricorex.com/meetings/${encodeURIComponent(meetingCode)}`;
            } catch { /* store timer still covers it */ }
          }
        }, 1200);
      } else {
        window.location.href = deepLink;
      }
    } catch {
      /* ignore — the store timer covers it */
    }

    // App didn't take over in 2.5s → show the download buttons.
    storeTimer = window.setTimeout(() => {
      if (!document.hidden) setShowStores(true);
      setLaunching(false);
    }, 2500);

    return () => {
      document.removeEventListener("visibilitychange", visibilityHandler);
      if (storeTimer) window.clearTimeout(storeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, meetingCode]);

  if (!isMobile || continueOnWeb) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Smartphone className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Join this meeting</h1>
          <p className="text-sm text-muted-foreground">
            For the best experience, open this meeting in the Metroflow mobile app. Prefer the
            browser? You can continue on the web instead.
          </p>
        </div>

        <div className="space-y-3">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
            disabled={launching}
            onClick={() => {
              setLaunching(true);
              const deepLink = `${APP_SCHEME}://meetings/${encodeURIComponent(meetingCode)}`;
              if (isAndroid()) {
                const intentUrl =
                  `intent://meetings/${encodeURIComponent(meetingCode)}#Intent;` +
                  `scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(location.pathname)};end`;
                window.location.href = intentUrl;
              } else {
                window.location.href = deepLink;
              }
              window.setTimeout(() => {
                setLaunching(false);
                setShowStores(true);
              }, 2500);
            }}
          >
            {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            Open in the app
          </button>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition hover:bg-muted"
            onClick={() => setContinueOnWeb(true)}
          >
            <Globe className="h-4 w-4" />
            Continue with the web
          </button>
        </div>

        {showStores && (
          <div className="space-y-3 rounded-2xl border p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Don't have the app yet? Download it here:
            </p>
            <DownloadAppButtons links={links} />
          </div>
        )}
      </div>
    </div>
  );
}
