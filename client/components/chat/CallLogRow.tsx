import { ArrowDownLeft, ArrowUpRight, Phone, PhoneMissed, Video } from "lucide-react";
import { formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { formatCallDuration, parseCallLogContent } from "@/lib/chat-media";
import { parseDateSafe } from "@/lib/last-seen";
import type { ChatCallLogMeta } from "@shared/api";

/**
 * WhatsApp-style call record row inside a chat conversation.
 *
 * Call-log messages (messageType='call-log' — or content that parses as a
 * call-log JSON payload) render as a slim list row:
 *
 *   [(↙|↗) phone/video]  Incoming voice call          2:05
 *                        Missed · 4:32 PM
 *
 * - red icon tile for missed/cancelled/declined/no-answer
 * - neutral tile for completed calls (duration shown instead of "Ended")
 * - tapping the row opens the CallSummarySheet (call detail from /calls/:id)
 */
export function CallLogRow({
  content,
  createdAt,
  isOwn,
  onOpen,
}: {
  /** Raw JSON string payload of the call-log message. */
  content?: string;
  createdAt?: string;
  /** True when the call was initiated by the current user. */
  isOwn: boolean;
  /** Opens the call summary sheet with the parsed metadata. */
  onOpen?: (meta: ChatCallLogMeta) => void;
}) {
  const meta = parseCallLogContent(content);

  if (!meta) {
    // Defensive fallback: never crash the list on a malformed payload.
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full border border-border/60 bg-muted/70 px-3 py-1 text-[11px] text-muted-foreground">
          Call record
        </span>
      </div>
    );
  }

  const answered = meta.status === "completed";
  const isVideo = meta.callType === "video";
  const MediumIcon = isVideo ? Video : Phone;

  const direction = isOwn ? "Outgoing" : "Incoming";
  const medium = isVideo ? "video call" : "voice call";

  const statusText = !answered
    ? meta.status === "cancelled"
      ? "Cancelled"
      : meta.status === "declined"
        ? "Declined"
        : meta.status === "no-answer"
          ? "No answer"
          : "Missed"
    : null;

  // Relative-ish row date: time today, "Yesterday", else short date.
  const when = (() => {
    const d = parseDateSafe(createdAt || meta.endedAt);
    if (!d) return "";
    const now = new Date();
    const dayDiff = Math.floor(
      (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
        86_400_000,
    );
    if (dayDiff === 0) return formatTime(d.toISOString());
    if (dayDiff === 1) return "Yesterday";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  })();

  return (
    <div className="flex py-1 animate-in fade-in duration-200" style={{ justifyContent: isOwn ? "flex-end" : "flex-start" }}>
      <button
        type="button"
        onClick={() => onOpen?.(meta)}
        className={cn(
          "flex w-[min(92%,340px)] items-center gap-3 rounded-2xl border border-border/60 bg-muted/50 px-3 py-2 text-left backdrop-blur-sm transition-colors",
          "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        )}
        aria-label={`Open ${direction} ${medium} details`}
      >
        <span className="relative shrink-0">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full",
              answered
                ? "bg-muted-foreground/10 text-muted-foreground dark:bg-muted dark:text-foreground/70"
                : "bg-red-500/15 text-red-500",
            )}
          >
            {!answered && <PhoneMissed className="absolute -left-0.5 -top-0.5 h-3 w-3 opacity-0" aria-hidden />}
            <MediumIcon className="h-4 w-4" />
          </span>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-card",
              answered ? "bg-emerald-500 text-white" : "bg-red-500 text-white",
            )}
            aria-hidden
          >
            {isOwn ? (
              <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={3} />
            ) : (
              <ArrowDownLeft className="h-2.5 w-2.5" strokeWidth={3} />
            )}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {direction} {medium}
            </span>
            {answered && meta.durationSeconds ? (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground" title="Call duration">
                {formatCallDuration(meta.durationSeconds)}
              </span>
            ) : null}
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-[11px]", answered ? "text-muted-foreground" : "font-medium text-red-500")}>
              {answered ? (meta.durationSeconds ? "Ended" : "Completed") : statusText}
            </span>
            {when && <span className="shrink-0 text-[10px] text-muted-foreground">{when}</span>}
          </span>
        </span>
      </button>
    </div>
  );
}
