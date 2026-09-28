import { CheckCircle2, Phone, PhoneMissed, Video } from "lucide-react";
import { formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { formatCallDuration, parseCallLogContent } from "@/lib/chat-media";

/**
 * System call summary row inside a chat conversation.
 *
 * Call-log messages (messageType='call-log') carry a JSON content payload —
 * see parseCallLogContent(). They render as a slim CENTERED row (no chat
 * bubble), like WhatsApp call records:
 *
 *   [icon]  Outgoing video call          ← direction inferred from senderId
 *           Ended · 12:34 · 4:32 PM      ← status + formatted timestamp
 *
 * Icon color: green for answered calls, red for missed/cancelled.
 */
export function CallLogRow({
  content,
  createdAt,
  isOwn,
}: {
  /** Raw JSON string payload of the call-log message. */
  content?: string;
  createdAt?: string;
  /** True when the call was initiated by the current user. */
  isOwn: boolean;
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

  const ended = meta.status === "completed";
  const Icon = ended ? (meta.callType === "video" ? Video : Phone) : PhoneMissed;
  const direction = isOwn ? "Outgoing" : "Incoming";
  const medium = meta.callType === "video" ? "video call" : "voice call";

  let statusText: string;
  if (ended) {
    statusText = meta.durationSeconds
      ? `Ended · ${formatCallDuration(meta.durationSeconds)}`
      : "Ended";
  } else if (meta.status === "cancelled") {
    statusText = "Cancelled";
  } else {
    statusText = "Missed";
  }

  return (
    <div className="flex justify-center py-2 animate-in fade-in duration-200">
      <div className="flex max-w-[92%] items-center gap-2.5 rounded-2xl border border-border/60 bg-muted/50 px-3.5 py-2 backdrop-blur-sm">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            ended ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-500"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 text-left">
          <p className="flex items-center gap-1 truncate text-xs font-semibold text-foreground">
            {direction} {medium}
            {ended && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" aria-label="Answered" />}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {statusText}
            {createdAt ? ` · ${formatTime(createdAt)}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
