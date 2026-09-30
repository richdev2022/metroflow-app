/**
 * Chat media helpers (batch 3 — WhatsApp-style attachments).
 *
 * Pure utilities shared by Chat.tsx and the chat components:
 *  - file-size formatting for document cards
 *  - client-side attachment-kind detection (before upload)
 *  - the "big emoji" rule (a text message that is only 1-3 emoji renders
 *    without a bubble, like WhatsApp)
 *  - authenticated attachment downloads (API URLs may be private, so we
 *    fetch a blob with the shared axios instance; external/cloud URLs fall
 *    back to a plain anchor download)
 *  - file-extension -> icon metadata for document cards
 *  - safe parsing of call-log message payloads
 */
import { api } from "@/lib/api-client";
import { getApiOrigin } from "@/lib/media-url";
import type { ChatCallLogMeta } from "@shared/api";

/** Hard upload limit shared with the backend (POST /chat/media). */
export const CHAT_MEDIA_MAX_BYTES = 100 * 1024 * 1024; // 100MB

/** 0 -> "0 B", 1536 -> "1.5 KB", 5_242_880 -> "5 MB" */
export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || !isFinite(bytes) || bytes < 0) return "";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  const text = exp === 0 ? String(Math.round(value)) : value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${text} ${units[exp]}`;
}

/** Attachment kinds accepted by POST /chat/media. */
export type ChatMediaKind = "image" | "video" | "audio" | "document" | "gif";

const EXT_KIND_MAP: Record<string, ChatMediaKind> = {
  gif: "gif",
  webm: "video",
  mp4: "video",
  mov: "video",
  avi: "video",
  mkv: "video",
  m4v: "video",
  mp3: "audio",
  m4a: "audio",
  aac: "audio",
  ogg: "audio",
  oga: "audio",
  opus: "audio",
  wav: "audio",
};

/** Best-effort client-side kind detection (backend re-detects authoritatively). */
export function guessMediaKind(file: File): ChatMediaKind {
  const type = (file.type || "").toLowerCase();
  if (type === "image/gif") return "gif";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return EXT_KIND_MAP[ext] || "document";
}

// ==========================================
// "Big emoji" rule — text made only of 1-3 emoji
// ==========================================

// ZWJ sequences, skin-tone modifiers and variation selectors are glued to the
// base pictographic; regional indicators pair up into flags. Digits/# / * are
// Emoji_Component but carry zero pictographics, so they never qualify alone.
const EMOJI_ONLY_CHARS_RE =
  /^(?:[\p{Extended_Pictographic}\p{Emoji_Component}\p{Emoji_Modifier}\uFE0F\u200D])+$/u;

export function isSoloEmojiMessage(text?: string | null): boolean {
  if (!text) return false;
  const t = text.trim();
  if (!t || t.length > 32 || !EMOJI_ONLY_CHARS_RE.test(t)) return false;
  const pictographic = (t.match(/\p{Extended_Pictographic}/gu) || []).length;
  const regional = (t.match(/[\u{1F1E6}-\u{1F1FF}]/gu) || []).length;
  const emojiCount = pictographic + regional / 2;
  return emojiCount >= 1 && emojiCount <= 3;
}

// ==========================================
// Authenticated attachment download
// ==========================================

/**
 * Downloads a chat attachment.
 *
 * - URLs that resolve to OUR API/app origin may be private, so the blob is
 *   fetched through the shared axios instance (Authorization header attached
 *   by its request interceptor) and saved via a temporary object URL.
 * - External URLs (Cloudinary / R2 public buckets) are public — a plain
 *   anchor with the `download` attribute is enough and avoids CORS reading.
 */
export async function downloadChatAttachment(url: string, filename: string): Promise<void> {
  const isExternal = (() => {
    if (!/^https?:\/\//i.test(url)) return false;
    try {
      const parsed = new URL(url);
      const apiOrigin = getApiOrigin();
      return parsed.origin !== apiOrigin && parsed.origin !== window.location.origin;
    } catch {
      return false;
    }
  })();

  const triggerDownload = (href: string) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    if (isExternal) link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isExternal) {
    triggerDownload(url);
    return;
  }

  const response = await api.get(url, { responseType: "blob" });
  const contentType = (response.headers?.["content-type"] as string) || "application/octet-stream";
  const blob = new Blob([response.data as BlobPart], { type: contentType });
  const objectUrl = window.URL.createObjectURL(blob);
  try {
    triggerDownload(objectUrl);
  } finally {
    // Give the click handler a tick before revoking.
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 4_000);
  }
}

// ==========================================
// Document-card icon metadata (colored by extension)
// ==========================================

export interface FileIconMeta {
  label: string;
  /** Tailwind classes for the icon tile (bg + text). */
  tileClass: string;
}

const EXT_ICON_MAP: Record<string, FileIconMeta> = {
  pdf: { label: "PDF", tileClass: "bg-red-500/15 text-red-600 dark:text-red-400" },
  doc: { label: "DOC", tileClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  docx: { label: "DOCX", tileClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  xls: { label: "XLS", tileClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  xlsx: { label: "XLSX", tileClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  csv: { label: "CSV", tileClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  ppt: { label: "PPT", tileClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  pptx: { label: "PPTX", tileClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  txt: { label: "TXT", tileClass: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  zip: { label: "ZIP", tileClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  rar: { label: "RAR", tileClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  "7z": { label: "7Z", tileClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
};

const DEFAULT_FILE_ICON: FileIconMeta = {
  label: "FILE",
  tileClass: "bg-primary/15 text-primary",
};

export function getFileIconMeta(name?: string | null): FileIconMeta {
  if (!name) return DEFAULT_FILE_ICON;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return EXT_ICON_MAP[ext] || DEFAULT_FILE_ICON;
}

/** Strips query/hash and any "uploads/..." path noise for a display name. */
export function attachmentDisplayName(
  attachmentName?: string | null,
  url?: string | null
): string {
  if (attachmentName && attachmentName.trim()) return attachmentName.trim();
  if (!url) return "Attachment";
  try {
    const clean = url.split("?")[0].split("#")[0];
    return decodeURIComponent(clean.split("/").pop() || "") || "Attachment";
  } catch {
    return "Attachment";
  }
}

// ==========================================
// Call-log message parsing
// ==========================================

/**
 * Call-log messages carry `messageType: 'call-log'` and a JSON `content`:
 * { callType, status, durationSeconds, initiatorName, callCode, callId?,
 *   conversationId?, hasTranscript?, endedAt? }.
 * Statuses: completed | missed | cancelled | declined | no-answer.
 *
 * Detection is intentionally DEFENSIVE — this parser is also the fallback used
 * to identify call-log rows whose messageType flag is missing entirely (older
 * backend rows / snake_case payloads), which is why it only requires the
 * { callType, status } key pair. Never trust the wire — return null on garbage.
 */
export const CALL_LOG_STATUSES = [
  "completed",
  "missed",
  "cancelled",
  "declined",
  "no-answer",
  "no_answer",
] as const;

export type CallLogStatus = (typeof CALL_LOG_STATUSES)[number];

export function parseCallLogContent(content?: string | null): ChatCallLogMeta | null {
  if (!content) return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null; // fast path: plain text messages
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    // Must at least LOOK like a call-log payload (callType + status keys).
    if (typeof parsed.callType !== "string" || typeof parsed.status !== "string") return null;
    const callType = parsed.callType === "video" ? "video" : "audio";
    const rawStatus = parsed.status.toLowerCase().replace("_", "-");
    const status = (CALL_LOG_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus === "no_answer" ? "no-answer" : rawStatus)
      : null;
    if (!status) return null;
    const durationSeconds =
      typeof parsed.durationSeconds === "number" && isFinite(parsed.durationSeconds) && parsed.durationSeconds > 0
        ? Math.round(parsed.durationSeconds)
        : null;
    return {
      callType,
      status: status as ChatCallLogMeta["status"],
      durationSeconds,
      initiatorName: typeof parsed.initiatorName === "string" ? parsed.initiatorName : null,
      callCode: typeof parsed.callCode === "string" ? parsed.callCode : null,
      callId: typeof parsed.callId === "string" ? parsed.callId : null,
      conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : null,
      hasTranscript: typeof parsed.hasTranscript === "boolean" ? parsed.hasTranscript : null,
      endedAt: typeof parsed.endedAt === "string" ? parsed.endedAt : null,
    };
  } catch {
    return null;
  }
}

/** 754 -> "12:34", 45 -> "0:45" */
export function formatCallDuration(totalSeconds?: number | null): string {
  const secs = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
