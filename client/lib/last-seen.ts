/**
 * Last-seen formatting (chat presence).
 *
 * THE REPORTED BUG: "last seen" times were wrong. Root causes handled here:
 *  1. Backend timestamps arrive in mixed shapes — ISO strings, "YYYY-MM-DD
 *     HH:mm:ss" (no timezone marker), epoch seconds and epoch ms. Naive
 *     `new Date(x)` mis-parses several of those (a missing Z makes browsers
 *     assume device-local time instead of UTC).
 *  2. The old formatter rendered a coarse "5 hours ago" style string instead
 *     of a wall-clock time, which made correct instants LOOK wrong.
 *
 * This module parses defensively and formats with the user's LOCAL timezone
 * via Intl (NOT the business timezone — presence is personal, like WhatsApp).
 */

export type DateInput = string | number | Date | null | undefined;

/** Parse anything the backend might send into a real Date (UTC-corrected). */
export function parseDateSafe(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    // Epoch seconds (< 1e12) vs epoch milliseconds.
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (!s) return null;
  // Pure epoch strings: "1735689600" (s) / "1735689600000" (ms).
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);
  if (/^\d{13}$/.test(s)) return new Date(Number(s));
  // "2026-10-12 19:46:00(.123)" — space-separated, no timezone: the backend
  // writes UTC via Postgres. Without the Z the browser assumes local time and
  // the displayed "last seen" drifts by the UTC offset (the reported bug).
  const naive = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)(?!Z|[+-]\d{2}:?\d{2})$/.exec(s);
  if (naive) s = `${naive[1]}T${naive[2]}Z`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const timeFmt = () =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
const dayFmt = () => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const fullDateFmt = () =>
  new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Same calendar day? (both in the viewer's local timezone) */
function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * "today at 7:46 PM" | "yesterday at 3:02 PM" | "12 Oct 2026"
 * (the "last seen " prefix is added by the caller so the same helper works
 * for headers and profile chips).
 */
export function formatLastSeen(value: DateInput, now: Date = new Date()): string | null {
  const d = parseDateSafe(value);
  if (!d) return null;
  if (isSameLocalDay(d, now)) return `today at ${timeFmt().format(d)}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(d, yesterday)) return `yesterday at ${timeFmt().format(d)}`;
  // Within this calendar year keep it short ("12 Oct"), otherwise full date.
  if (d.getFullYear() === now.getFullYear()) return dayFmt().format(d);
  return fullDateFmt().format(d);
}

/** True when the instant is within `thresholdMs` of now (default 60s). */
export function isRecent(value: DateInput, thresholdMs = 60_000): boolean {
  const d = parseDateSafe(value);
  if (!d) return false;
  return now64() - d.getTime() <= thresholdMs && now64() - d.getTime() >= -thresholdMs;
}

function now64() {
  return Date.now();
}
