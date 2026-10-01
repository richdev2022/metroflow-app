import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, Loader2, Mic, Phone, Sparkles, Users, Video, Volume2 } from "lucide-react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api-client";
import { getApiMessage, unwrapApiData } from "@/lib/api-response";
import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";
import { formatDuration, buildCallReportPdf, fmtDateTime } from "@/lib/report-pdf";
import JoinCall from "@/pages/JoinCall";

// ==========================================
// Backend contract (GET /calls/:id, GET /calls/:id/transcript)
// ==========================================

interface CallDetailParticipant {
  userId: string;
  name?: string | null;
  avatarUrl?: string | null;
  joinedAt?: string | null;
  leftAt?: string | null;
  durationSeconds?: number | null;
}

interface CallDetailData {
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
  notes?: {
    summary?: string | null;
    keyPoints?: string[] | null;
    decisions?: string[] | null;
    actionItems?: Array<{ title?: string; task?: string; assignedTo?: string | null; ownerName?: string | null; dueDate?: string | null; status?: string }> | null;
    importantTimestamps?: Array<{ ts?: string; description?: string }> | null;
  } | null;
}

interface TranscriptEntry {
  id: string;
  speakerId?: string | null;
  speakerName?: string | null;
  text: string;
  createdAt?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function initialsOf(name?: string | null): string {
  const trimmed = (name || "?").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.substring(0, 2).toUpperCase();
}

/**
 * Full call detail page: header chips, participants grid, transcript timeline,
 * recording player and a downloadable PDF "Call Report" (jspdf).
 */
export default function CallDetail() {
  const { id } = useParams<{ id?: string; callCode?: string }>();
  const callId = id || "";
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CallDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[] | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadCall = useCallback(() => {
    if (!callId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(`/calls/${callId}`)
      .then((res) => {
        if (cancelled) return;
        setDetail(unwrapApiData<CallDetailData>(res.data, "Failed to load call"));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getApiMessage(err, "Failed to load call details."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [callId]);

  useEffect(() => {
    const cleanup = loadCall();
    return cleanup;
  }, [loadCall]);

  useEffect(() => {
    if (!callId || !detail?.hasTranscript) return;
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
  }, [callId, detail?.hasTranscript]);

  const handleDownloadReport = async () => {
    if (!detail) return;
    setDownloading(true);
    try {
      const doc = await buildCallReportPdf({
        call: detail.call,
        participants: detail.participants || [],
        transcripts: transcripts || undefined,
        recording: detail.recording
          ? { storageUrl: detail.recording.storageUrl, duration: detail.recording.duration }
          : null,
        notes: detail.notes || null,
      });
      await doc.save(`MetriCorex-Call-Report-${detail.call.callCode || detail.call.id}.pdf`);
      toast({ title: "Report downloaded" });
    } catch (err) {
      toast({ variant: "destructive", title: "Export failed", description: getApiMessage(err, "Could not generate the PDF report.") });
    } finally {
      setDownloading(false);
    }
  };

  const callTypeLabel = detail?.call?.type === "video" ? "Video call" : "Audio call";

  const recordingUrl = useMemo(
    () => (detail?.recording?.storageUrl ? resolveMediaUrl(detail.recording.storageUrl) : null),
    [detail?.recording?.storageUrl],
  );
  const recordingIsVideo = useMemo(() => {
    const url = recordingUrl || "";
    return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
  }, [recordingUrl]);

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {/* Gradient hero */}
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white shadow-xl">
          <CardContent className="space-y-5 py-7">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-white hover:bg-white/15" onClick={() => window.history.back()} aria-label="Go back">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0">
                  <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
                    {detail?.call?.type === "video" ? <Video className="h-5 w-5 shrink-0" /> : <Phone className="h-5 w-5 shrink-0" />}
                    <span className="truncate">{callTypeLabel}</span>
                  </h1>
                  <p className="mt-0.5 truncate text-xs text-white/70">
                    {detail?.call?.callCode ? `Call code ${detail.call.callCode} · ` : ""}
                    {fmtDateTime(detail?.call?.startedAt)}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="shrink-0 rounded-xl bg-white text-blue-900 hover:bg-white/90"
                disabled={!detail || downloading}
                onClick={handleDownloadReport}
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Report
              </Button>
            </div>
            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Status</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold capitalize">
                  <span className={cn("inline-block h-2 w-2 rounded-full", detail?.call?.status === "completed" ? "bg-emerald-400" : detail?.call?.status === "ongoing" ? "bg-blue-300" : "bg-amber-300")} />
                  {detail?.call?.status || "—"}
                </p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Duration</p>
                <p className="mt-0.5 text-sm font-semibold font-mono">
                  {detail?.call?.durationSeconds ? formatDuration(detail.call.durationSeconds) : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Participants</p>
                <p className="mt-0.5 text-sm font-semibold">{detail?.participants?.length ?? 0}</p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Recording</p>
                <p className="mt-0.5 text-sm font-semibold">{detail?.recording ? (detail.recording.duration ? `${Math.round(detail.recording.duration / 60)} min` : "Saved") : "None"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <Card>
            <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading call details…
            </CardContent>
          </Card>
        )}

        {!loading && error && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={loadCall}>
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && detail && (
          <>
            {/* Participants */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" /> Participants ({detail.participants?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(detail.participants || []).map((p) => {
                    const name = p.name || p.userId;
                    return (
                      <div key={p.userId} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
                        <Avatar className="h-10 w-10">
                          {p.avatarUrl && <AvatarImage src={resolveMediaUrl(p.avatarUrl)} alt={name} />}
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-semibold text-white">
                            {initialsOf(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {p.joinedAt ? `Joined ${fmtDateTime(p.joinedAt)}` : "Invited"}
                            {p.leftAt ? ` · Left ${fmtDateTime(p.leftAt)}` : ""}
                          </p>
                          {p.durationSeconds ? (
                            <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              {formatDuration(p.durationSeconds)} talk time
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {(!detail.participants || detail.participants.length === 0) && (
                    <p className="text-sm text-muted-foreground">No participant records.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AI Summary & Action Points */}
            {detail.notes && (detail.notes.summary || (detail.notes.actionItems?.length || 0) > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4" /> AI Summary & Action Points
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {detail.notes.summary && (
                    <p className="text-sm leading-relaxed text-foreground/90">{detail.notes.summary}</p>
                  )}
                  {(detail.notes.keyPoints?.length || 0) > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key points</p>
                      <ul className="space-y-1.5">
                        {detail.notes.keyPoints!.map((kp, i) => (
                          <li key={i} className="flex gap-2 text-sm"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" /><span className="min-w-0">{kp}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(detail.notes.decisions?.length || 0) > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decisions</p>
                      <ul className="space-y-1.5">
                        {detail.notes.decisions!.map((d, i) => (
                          <li key={i} className="flex gap-2 text-sm"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" /><span className="min-w-0">{d}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(detail.notes.actionItems?.length || 0) > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action points</p>
                      <div className="space-y-2">
                        {detail.notes.actionItems!.map((ai, i) => {
                          const owner = ai.ownerName || ai.assignedTo || null;
                          return (
                            <div key={i} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{ai.title || ai.task || "Action item"}</p>
                                {ai.dueDate && <p className="text-[11px] text-muted-foreground">Due {ai.dueDate}</p>}
                              </div>
                              {owner && (
                                <Badge variant="outline" className="shrink-0 border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                  {owner}
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Recording */}
            {recordingUrl && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Volume2 className="h-4 w-4" /> Recording
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {recordingIsVideo ? (
                    <video src={recordingUrl} controls className="w-full rounded-xl border border-border/60" preload="metadata" />
                  ) : (
                    <audio src={recordingUrl} controls className="w-full" preload="metadata" />
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    <a href={recordingUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                      Open recording in a new tab
                    </a>
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Transcript */}
            {(detail.hasTranscript || transcripts) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" /> Transcript
                    {detail.transcriptsCount ? (
                      <span className="text-xs font-normal text-muted-foreground">({detail.transcriptsCount} entries)</span>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {transcripts === null ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading transcript…
                    </div>
                  ) : transcripts.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">No transcript entries.</p>
                  ) : (
                    <ScrollArea className="max-h-[420px] pr-2">
                      <div className="space-y-3">
                        {transcripts.map((t) => (
                          <div key={t.id} className="flex gap-3">
                            <div className="w-28 shrink-0 pt-0.5 text-right">
                              <p className="truncate text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                {t.speakerName || "Speaker"}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {t.createdAt
                                  ? new Date(t.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                                  : ""}
                              </p>
                            </div>
                            <div className="min-w-0 flex-1 rounded-xl bg-muted/50 px-3 py-2">
                              <p className="text-sm leading-relaxed break-words">{t.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            )}

            {!detail.hasTranscript && !detail.recording && (
              <Card>
                <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Mic className="mr-2 h-4 w-4" /> No transcript or recording for this call.
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

/**
 * Route adapter for /calls/:callCode — the URL segment can be either a call
 * UUID (detail page) or a join code (guest/host join flow). Rendering the
 * existing JoinCall element keeps the join-by-code behavior untouched.
 */
export function CallDetailRoute() {
  const { callCode } = useParams<{ callCode: string }>();
  if (callCode && UUID_RE.test(callCode)) {
    return <CallDetail />;
  }
  return <JoinCall />;
}
