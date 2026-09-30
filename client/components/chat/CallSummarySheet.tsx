import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, FileText, Loader2, Mic, Phone, Video, Volume2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api-client";
import { getApiMessage, unwrapApiData } from "@/lib/api-response";
import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";
import { formatCallDuration } from "@/lib/chat-media";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { parseDateSafe } from "@/lib/last-seen";
import type { ChatCallLogMeta } from "@shared/api";

// ==========================================
// Backend contract types (GET /calls/:id, GET /calls/:id/transcript)
// ==========================================

interface CallDetailParticipant {
  userId: string;
  name?: string | null;
  avatarUrl?: string | null;
  joinedAt?: string | null;
  leftAt?: string | null;
  durationSeconds?: number | null;
}

interface CallDetail {
  call: {
    id: string;
    type: "audio" | "video" | string;
    status: string;
    startedAt?: string | null;
    endedAt?: string | null;
    durationSeconds?: number | null;
    callCode?: string | null;
    isGroupCall?: boolean;
  };
  participants: CallDetailParticipant[];
  hasTranscript?: boolean;
  transcriptsCount?: number;
  recording: {
    id: string;
    storageUrl: string;
    duration?: number | null;
    size?: number | null;
    status?: string | null;
  } | null;
  conversationId?: string | null;
}

interface TranscriptEntry {
  id: string;
  speakerId?: string | null;
  speakerName?: string | null;
  text: string;
  createdAt?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  missed: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  declined: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  "no-answer": "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

function initialsOf(name?: string | null): string {
  const trimmed = (name || "?").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.substring(0, 2).toUpperCase();
}

/**
 * Bottom/right sheet opened when tapping a call-log row in Chat.
 * Shows participants, duration, status chip, a transcript preview and the
 * recording link when the backend has them — with a graceful fallback to the
 * (always available) call-log JSON payload when /calls/:id is unavailable.
 */
export function CallSummarySheet({
  open,
  onOpenChange,
  meta,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: ChatCallLogMeta | null;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[] | null>(null);

  const callId = meta?.callId || null;

  useEffect(() => {
    if (!open || !callId) {
      setDetail(null);
      setDetailError(null);
      setTranscripts(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDetailError(null);
    api
      .get(`/calls/${callId}`)
      .then((res) => {
        if (cancelled) return;
        setDetail(unwrapApiData<CallDetail>(res.data, "Failed to load call"));
      })
      .catch((err) => {
        if (cancelled) return;
        setDetailError(getApiMessage(err, "Call details are not available for this record."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, callId]);

  // Transcript preview (only when the payload advertises one).
  useEffect(() => {
    const hasTranscript = detail?.hasTranscript ?? meta?.hasTranscript;
    if (!open || !callId || !hasTranscript || transcripts) return;
    let cancelled = false;
    api
      .get(`/calls/${callId}/transcript`)
      .then((res) => {
        if (cancelled) return;
        const data = unwrapApiData<{ transcripts?: TranscriptEntry[] }>(res.data, "");
        setTranscripts(data?.transcripts || []);
      })
      .catch(() => {
        if (!cancelled) setTranscripts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, callId, detail?.hasTranscript, meta?.hasTranscript, transcripts]);

  if (!meta) return null;

  const isOwn = true; // direction is rendered by the row; the sheet is neutral
  void isOwn;
  const answered = meta.status === "completed";
  const isVideo = meta.callType === "video";
  const duration =
    detail?.call?.durationSeconds ??
    (meta.durationSeconds ?? null);

  const statusChip = (
    <Badge variant="outline" className={cn("border capitalize", STATUS_STYLES[meta.status] || "")}>
      {meta.status === "no-answer" ? "no answer" : meta.status}
    </Badge>
  );

  const participants: CallDetailParticipant[] = detail?.participants || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/70">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full",
                answered ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-500",
              )}
            >
              {isVideo ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base leading-tight">
                {isVideo ? "Video call" : "Voice call"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {meta.initiatorName ? `Started by ${meta.initiatorName}` : "Call record"}
              </SheetDescription>
            </div>
            {statusChip}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-5">
            {/* Meta table */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Duration</p>
                <p className="font-medium text-foreground">{duration ? formatCallDuration(duration) : "—"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ended</p>
                <p className="font-medium text-foreground">
                  {(() => {
                    const d = parseDateSafe(meta.endedAt);
                    return d ? formatTime(d.toISOString()) : "—";
                  })()}
                </p>
              </div>
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading call details…
              </div>
            )}

            {detailError && !detail && (
              <p className="text-xs text-muted-foreground">{detailError}</p>
            )}

            {/* Participants */}
            {(participants.length > 0 || meta.initiatorName) && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Participants
                </p>
                <div className="space-y-1.5">
                  {participants.length === 0 && meta.initiatorName && (
                    <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-semibold text-white">
                          {initialsOf(meta.initiatorName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{meta.initiatorName}</p>
                        <p className="text-[11px] text-muted-foreground">Caller</p>
                      </div>
                    </div>
                  )}
                  {participants.map((p) => {
                    const name = p.name || p.userId;
                    return (
                      <div key={p.userId} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                        <Avatar className="h-8 w-8">
                          {p.avatarUrl && <AvatarImage src={resolveMediaUrl(p.avatarUrl)} alt={name} />}
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-semibold text-white">
                            {initialsOf(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {p.joinedAt ? `Joined ${formatTime(p.joinedAt)}` : "Invited"}
                            {p.leftAt ? ` · Left ${formatTime(p.leftAt)}` : ""}
                            {p.durationSeconds ? ` · ${formatCallDuration(p.durationSeconds)}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Transcript preview */}
            {(detail?.hasTranscript || meta.hasTranscript) && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> Transcript
                  {detail?.transcriptsCount ? (
                    <span className="font-normal normal-case">({detail.transcriptsCount})</span>
                  ) : null}
                </p>
                {transcripts === null ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading transcript…
                  </div>
                ) : transcripts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No transcript entries.</p>
                ) : (
                  <div className="space-y-2">
                    {transcripts.slice(0, 6).map((t) => (
                      <div key={t.id} className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                            {t.speakerName || "Speaker"}
                          </p>
                          {t.createdAt && (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {formatTime(t.createdAt)}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-foreground/90">{t.text}</p>
                      </div>
                    ))}
                    {transcripts.length > 6 && (
                      <p className="text-[11px] text-muted-foreground">
                        +{transcripts.length - 6} more on the full call page
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Recording */}
            {detail?.recording?.storageUrl && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Volume2 className="h-3.5 w-3.5" /> Recording
                </p>
                <a
                  href={resolveMediaUrl(detail.recording.storageUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm text-blue-600 hover:bg-muted/60 dark:text-blue-400"
                >
                  <Mic className="h-4 w-4" /> Open recording
                  {detail.recording.duration ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatCallDuration(detail.recording.duration)}
                    </span>
                  ) : null}
                </a>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border/70 p-4">
          <Button
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"
            disabled={!callId}
            onClick={() => {
              onOpenChange(false);
              if (callId) navigate(`/calls/${callId}`);
            }}
          >
            View full detail
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Direction glyph reused by the summary (kept local for clarity). */
export function CallDirectionIcon({ isOwn, className }: { isOwn: boolean; className?: string }) {
  return isOwn ? (
    <ArrowUpRight className={className} />
  ) : (
    <ArrowDownLeft className={className} />
  );
}
