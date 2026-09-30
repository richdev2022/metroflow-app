import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, Loader2, Mic, Phone, Users, Video, Volume2 } from "lucide-react";
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
}

interface TranscriptEntry {
  id: string;
  speakerId?: string | null;
  speakerName?: string | null;
  text: string;
  createdAt?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  ongoing: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  ringing: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
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

  useEffect(() => {
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
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => window.history.back()} aria-label="Go back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
                {detail?.call?.type === "video" ? (
                  <Video className="h-5 w-5 shrink-0" />
                ) : (
                  <Phone className="h-5 w-5 shrink-0" />
                )}
                <span className="truncate">{callTypeLabel}</span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {detail?.call?.callCode ? `Call code ${detail.call.callCode} · ` : ""}
                {fmtDateTime(detail?.call?.startedAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
            {detail?.call?.status && (
              <Badge variant="outline" className={cn("border capitalize", STATUS_STYLES[detail.call.status] || "")}>
                {detail.call.status}
              </Badge>
            )}
            {detail?.call?.durationSeconds ? (
              <Badge variant="outline" className="border-border font-mono">
                {formatDuration(detail.call.durationSeconds)}
              </Badge>
            ) : null}
            <Button
              size="sm"
              className="rounded-xl"
              disabled={!detail || downloading}
              onClick={handleDownloadReport}
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Download report
            </Button>
          </div>
        </div>

        {loading && (
          <Card>
            <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading call details…
            </CardContent>
          </Card>
        )}

        {!loading && error && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">{error}</CardContent>
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
