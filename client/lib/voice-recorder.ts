// MediaRecorder helpers for WhatsApp-style voice notes in chat.

/**
 * Preferred MediaRecorder mimeType order: opus/webm (Chrome/Firefox),
 * plain webm, mp4 (Safari), then browser default ('' means let the
 * browser choose).
 */
export const VOICE_NOTE_MIME_PREFERENCE = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  '',
];

/** Pick the best supported MediaRecorder mimeType for this browser. */
export function pickVoiceMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mime of VOICE_NOTE_MIME_PREFERENCE) {
    if (!mime) return '';
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // isTypeSupported can throw on exotic input; keep probing.
    }
  }
  return '';
}

/** Map a MediaRecorder mimeType to a sensible file extension. */
export function voiceNoteExtension(mimeType: string): string {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'mp4';
  if (mime.includes('ogg') || mime.includes('opus')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

/** Format milliseconds as m:ss (e.g. 65000 -> "1:05"). */
export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/** Format seconds as m:ss (used by the voice-note player for audio.duration). */
export function formatSeconds(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const totalSec = Math.floor(seconds);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
