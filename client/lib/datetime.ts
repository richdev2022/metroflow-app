// Timezone-aware date/time utilities.
// The business timezone is set on the Settings page (persisted on the
// business record via PUT /settings { timezone }). Every date/time display
// in the app should render through these helpers so the user's chosen
// timezone is honoured consistently.

const TZ_STORAGE_KEY = 'metricorex:business-timezone';

let cachedTimezone: string | null = null;

function readStoredTimezone(): string | null {
  try {
    return localStorage.getItem(TZ_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Current display timezone (falls back to the device timezone, then UTC). */
export function getTimezone(): string {
  if (cachedTimezone) return cachedTimezone;
  const stored = readStoredTimezone();
  if (stored) {
    cachedTimezone = stored;
    return stored;
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Set the app-wide display timezone (called from Settings / app boot). */
export function setTimezone(tz: string): void {
  cachedTimezone = tz || 'UTC';
  try {
    localStorage.setItem(TZ_STORAGE_KEY, cachedTimezone);
  } catch {
    /* storage unavailable - keep in-memory only */
  }
}

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: getTimezone() });
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** e.g. "Sep 28, 2026" */
export function formatDate(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return formatter({ year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}

/** e.g. "3:45 PM" */
export function formatTime(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return formatter({ hour: 'numeric', minute: '2-digit' }).format(d);
}

/** e.g. "Sep 28, 2026, 3:45 PM" */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return formatter({
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/** e.g. "Mon, Sep 28, 2026" */
export function formatDateLong(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return formatter({
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** Relative label like "in 5 min" / "2 hours ago" (timezone-independent). */
export function formatRelative(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const fmt = (n: number, unit: string) =>
    diffMs > 0 ? `in ${n} ${unit}${n === 1 ? '' : 's'}` : `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (abs < minute) return diffMs >= 0 ? 'just now' : 'just now';
  if (abs < hour) return fmt(Math.round(abs / minute), 'min');
  if (abs < day) return fmt(Math.round(abs / hour), 'hour');
  if (abs < 7 * day) return fmt(Math.round(abs / day), 'day');
  return formatDate(d);
}

/** Hour/minute parts for a given date in the display timezone. */
export function getPartsInTimezone(value: Date | string | number) {
  const d = toDate(value)!;
  const parts = formatter({
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === '24' ? '00' : get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Convert a naive "wall clock" datetime in the business timezone to a real
 * UTC instant. Useful for meeting schedulers that let the user pick
 * "14:30 in Lagos" and need the absolute timestamp for the backend.
 */
export function wallClockToUtc(
  year: number, month: number, day: number, hour: number, minute: number,
  tz: string = getTimezone(),
): Date {
  // Build the timestamp assuming UTC, then correct by the timezone offset.
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (utcMs: number) => {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = dtf.formatToParts(new Date(utcMs));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    let h = get('hour'); if (h === 24) h = 0;
    return Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second')) - utcMs;
  };
  const offset = offsetAt(guessUtc);
  return new Date(guessUtc - offset);
}
