/**
 * Caption buffer logic for the call room (pure + unit-testable).
 *
 * The overlay shows a SINGLE compact pill: the previous final line and the
 * latest (possibly interim) line. This module maintains the rolling buffer:
 *   - keeps at most the last 3 FINAL segments,
 *   - keeps at most 1 trailing INTERIM segment (from the current speaker),
 *   - interim updates REPLACE the trailing interim in place (stable id) so
 *     React never remounts the pill mid-word (no reflow jump),
 *   - a final promotes/replaces the trailing interim (also with a stable id
 *     when it clearly descends from it, so the same DOM node just settles).
 */

export interface CaptionItem {
  /** Stable identity — interim updates must reuse the id of what they replace. */
  id: string;
  speakerId: string;
  speakerName: string;
  text: string;
  ts: string;
  isFinal: boolean;
}

/** How many FINAL lines the rolling buffer retains. */
export const MAX_FINALS = 3;

/** Auto-hide the captions pill this long after the last speech activity. */
export const CAPTION_AUTOHIDE_MS = 4000;

function makeId(speakerId: string, ts: string, salt: number): string {
  return `${ts}-${speakerId}-${salt.toString(36)}`;
}

let idSalt = 0;
export function nextCaptionId(speakerId: string, ts: string): string {
  idSalt = (idSalt + 1) % 0xfffff;
  return makeId(speakerId, ts, Date.now() % 0xfffff * 31 + idSalt);
}

/** Count of final segments in the buffer. */
function countFinals(buffer: CaptionItem[]): number {
  let n = 0;
  for (const item of buffer) if (item.isFinal) n += 1;
  return n;
}

/** Drop oldest finals so at most `max` remain (interims are never dropped here). */
function trimFinals(buffer: CaptionItem[], max: number = MAX_FINALS): CaptionItem[] {
  let finals = countFinals(buffer);
  const out = [...buffer];
  while (finals > max) {
    const idx = out.findIndex((item) => item.isFinal);
    if (idx === -1) break;
    out.splice(idx, 1);
    finals -= 1;
  }
  return out;
}

/**
 * Merge one incoming caption segment (interim or final) into the buffer.
 * Returns a NEW array; the input is never mutated.
 */
export function applyCaptionSegment(buffer: CaptionItem[], seg: CaptionItem): CaptionItem[] {
  const text = (seg.text || "").trim();
  if (!text) return buffer;

  const last = buffer.length > 0 ? buffer[buffer.length - 1] : null;

  // ------------------------------------------------------------------
  // Interim result: update the trailing interim IN PLACE (stable id), or
  // append a fresh interim after the finals. Never grows beyond 1 interim.
  // ------------------------------------------------------------------
  if (!seg.isFinal) {
    if (last && !last.isFinal) {
      const replaced: CaptionItem = { ...seg, id: last.id };
      const out = [...buffer.slice(0, -1), replaced];
      return out;
    }
    // New speaker started mid-stream — drop the stale interim from anyone else.
    return trimFinals([...buffer.filter((item) => item.isFinal), seg]);
  }

  // ------------------------------------------------------------------
  // Final result.
  // ------------------------------------------------------------------
  const out = last && !last.isFinal ? buffer.slice(0, -1) : [...buffer];

  // Idempotency: identical final repeated (relay echo) — keep stable.
  const previous = out.length > 0 ? out[out.length - 1] : null;
  if (previous && previous.isFinal && previous.speakerId === seg.speakerId && previous.text === seg.text) {
    return out;
  }

  // When the final text starts with the interim it replaces, keep the interim's
  // id so the DOM node settles instead of remounting (smooth pill behaviour).
  let id = seg.id;
  if (last && !last.isFinal && last.speakerId === seg.speakerId && seg.text.startsWith(last.text.slice(0, Math.max(8, Math.floor(last.text.length * 0.6))))) {
    id = last.id;
  }

  out.push({ ...seg, id, text, isFinal: true });
  return trimFinals(out);
}

/** The two lines shown in the pill: previous final + latest segment. */
export function visibleCaptions(buffer: CaptionItem[]): CaptionItem[] {
  return buffer.slice(-2);
}

/** Timestamp/id used to detect "new speech happened" (auto-hide timer reset). */
export function latestCaptionKey(buffer: CaptionItem[]): string {
  const last = buffer[buffer.length - 1];
  return last ? `${last.id}:${last.text.length}` : "";
}
