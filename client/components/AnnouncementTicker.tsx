import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * Announcement shape served by GET /api/public/app-config (no auth):
 * { success: boolean, data: { maintenance_mode: boolean, announcement: {
 *   id, title, message, updated_at } | null } }
 */
export interface AppConfigAnnouncement {
  id: string | number;
  title?: string;
  message: string;
  updated_at?: string;
}

interface AnnouncementResponse {
  success?: boolean;
  data?: {
    maintenance_mode?: boolean;
    announcement?: AppConfigAnnouncement | null;
  };
  announcement?: AppConfigAnnouncement | null;
}

const DISMISS_KEY = 'metricorex.announcement.dismissed';
const POLL_INTERVAL_MS = 5 * 60 * 1000;

function dismissKeyFor(announcement: AppConfigAnnouncement): string {
  return `${announcement.id}:${announcement.updated_at || ''}`;
}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/**
 * Slim animated announcement bar rendered below the authenticated header.
 * - Polls /api/public/app-config every 5 minutes and on window focus.
 * - Horizontally scrolling marquee message (pauses on hover).
 * - Dismissible for the session (localStorage keyed by id + updated_at).
 * - NEVER blocks app rendering: any failure just hides the bar.
 */
export function AnnouncementTicker() {
  const [announcement, setAnnouncement] = useState<AppConfigAnnouncement | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(readDismissed);
  const [paused, setPaused] = useState(false);
  const [shouldScroll, setShouldScroll] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get<AnnouncementResponse>('/public/app-config', {
        timeout: 10_000,
      });
      const body = res?.data;
      // Tolerate both { success, data: { announcement } } and a flat body.
      const next =
        body?.data?.announcement ??
        body?.announcement ??
        null;
      setAnnouncement(next && next.message ? next : null);
    } catch {
      // Public config is best-effort: never surface errors to the user.
    }
  }, []);

  useEffect(() => {
    // Fire and forget — the app renders regardless of the outcome.
    fetchConfig();
    const interval = window.setInterval(fetchConfig, POLL_INTERVAL_MS);
    const onFocus = () => {
      fetchConfig();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchConfig]);

  const handleDismiss = useCallback(() => {
    if (announcement) {
      const key = dismissKeyFor(announcement);
      try {
        localStorage.setItem(DISMISS_KEY, key);
      } catch { /* storage unavailable — session dismiss still works */ }
      setDismissedKey(key);
    }
    setAnnouncement(null);
  }, [announcement]);

  // Only animate the marquee when the message actually overflows the bar —
  // short announcements render as clean static text.
  useLayoutEffect(() => {
    if (!announcement) {
      setShouldScroll(false);
      return;
    }
    const measure = () => {
      const track = trackRef.current;
      const overflow = overflowRef.current;
      if (!track || !overflow) {
        setShouldScroll(false);
        return;
      }
      setShouldScroll(track.scrollWidth > overflow.clientWidth + 8);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [announcement]);

  if (!announcement) return null;
  if (dismissedKey && dismissedKey === dismissKeyFor(announcement)) return null;

  const message = announcement.message;

  return (
    <div
      role="status"
      aria-label="Announcement"
      className={cn(
        'relative z-20 flex w-full items-center overflow-hidden border-b border-amber-500/25',
        'bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-amber-500/15 backdrop-blur-sm'
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Fixed icon + title on the left */}
      <div className="flex shrink-0 items-center gap-2 py-1.5 pl-3 pr-2 sm:pl-4">
        <Megaphone className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        {announcement.title && (
          <span className="hidden max-w-[180px] truncate text-xs font-semibold text-amber-700 dark:text-amber-300 sm:inline">
            {announcement.title}
          </span>
        )}
      </div>

      {/* Marquee message (duplicate text gives the seamless infinite loop);
          falls back to static text when the message fits without scrolling */}
      <div
        ref={overflowRef}
        className="relative min-w-0 flex-1 overflow-hidden py-1.5"
      >
        <div
          ref={trackRef}
          className={cn('flex w-max items-center', shouldScroll && 'marquee-track', paused && 'marquee-paused')}
        >
          <span className="whitespace-nowrap pr-10 text-xs text-foreground/80">
            {message}
          </span>
          {shouldScroll && (
            <span className="whitespace-nowrap pr-10 text-xs text-foreground/80" aria-hidden="true">
              {message}
            </span>
          )}
        </div>
      </div>

      {/* Dismiss */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss announcement"
        className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8 md:mr-2"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default AnnouncementTicker;
