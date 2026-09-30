import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  Clock,
  Download,
  FileText,
  Gavel,
  ListChecks,
  Loader2,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
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
import { buildMeetingReportPdf, fmtDateTime } from "@/lib/report-pdf";
import JoinMeeting from "@/pages/JoinMeeting";

// ==========================================
// Backend contract (GET /meetings/:id/report)
// ==========================================

interface MeetingReportAttendee {
  userId?: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

interface MeetingReportData {
  meeting?: {
    id?: string;
    title?: string;
    status?: string;
    startTime?: string | null;
    endTime?: string | null;
    meetingCode?: string | null;
    timezone?: string | null;
  } | null;
  attendees?: MeetingReportAttendee[] | null;
  notes?: {
    summary?: string | null;
    keyPoints?: string[] | string | null;
    decisions?: string[] | string | null;
    actionItems?: Array<{ task: string; ownerName?: string | null }> | null;
    importantTimestamps?: Array<{ label?: string; timestamp?: string }> | string[] | null;
  } | null;
  transcripts?: Array<{ id?: string; speakerName?: string | null; text: string; createdAt?: string | null }> | null;
  recordings?: Array<{ id?: string; storageUrl?: string; duration?: number | null }> | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toStringList(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
  if (typeof value === "string") {
    return value
      .split(/\n|(?:^|\s)-\s/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function initialsOf(name?: string | null): string {
  const trimmed = (name || "?").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.substring(0, 2).toUpperCase();
}

function NoteList({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
              <span className="break-words">{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Full meeting detail page: meeting meta + attendees, AI notes (summary,
 * key points, decisions, action items, timestamps), transcript and
 * recordings — with a downloadable PDF "Meeting Report".
 */
export default function MeetingDetail() {
  const { id } = useParams<{ id?: string; meetingCode?: string }>();
  const meetingId = id || "";
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<MeetingReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(`/meetings/${meetingId}/report`)
      .then((res) => {
        if (cancelled) return;
        setReport(unwrapApiData<MeetingReportData>(res.data, "Failed to load meeting report"));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getApiMessage(err, "Failed to load the meeting report."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const handleDownloadReport = async () => {
    if (!report) return;
    setDownloading(true);
    try {
      const doc = await buildMeetingReportPdf(report);
      await doc.save(`MetriCorex-Meeting-Report-${report.meeting?.meetingCode || report.meeting?.id || meetingId}.pdf`);
      toast({ title: "Report downloaded" });
    } catch (err) {
      toast({ variant: "destructive", title: "Export failed", description: getApiMessage(err, "Could not generate the PDF report.") });
    } finally {
      setDownloading(false);
    }
  };

  const notes = report?.notes || {};
  const actionItems = notes.actionItems || [];
  const stamps = Array.isArray(notes.importantTimestamps) ? notes.importantTimestamps : [];
  const transcripts = report?.transcripts || [];
  const recordings = report?.recordings || [];

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
                <Video className="h-5 w-5 shrink-0" />
                <span className="truncate">{report?.meeting?.title || "Meeting"}</span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                <Calendar className="mr-1 inline h-3 w-3" />
                {fmtDateTime(report?.meeting?.startTime)}
                {report?.meeting?.endTime ? ` — ${fmtDateTime(report.meeting.endTime)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
            {report?.meeting?.status && (
              <Badge variant="outline" className="border-border capitalize">
                {report.meeting.status}
              </Badge>
            )}
            <Button size="sm" className="rounded-xl" disabled={!report || downloading} onClick={handleDownloadReport}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Download report
            </Button>
          </div>
        </div>

        {loading && (
          <Card>
            <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading meeting report…
            </CardContent>
          </Card>
        )}

        {!loading && error && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">{error}</CardContent>
          </Card>
        )}

        {!loading && report && (
          <>
            {/* Attendees */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" /> Attendees ({report.attendees?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {(report.attendees || []).map((a, i) => (
                    <div key={a.userId || i} className="flex items-center gap-2 rounded-full border border-border/60 py-1 pl-1 pr-3">
                      <Avatar className="h-7 w-7">
                        {a.avatarUrl && <AvatarImage src={resolveMediaUrl(a.avatarUrl)} alt={a.name || "Attendee"} />}
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-[9px] font-semibold text-white">
                          {initialsOf(a.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="max-w-[160px] truncate text-xs font-medium">{a.name || "Attendee"}</span>
                    </div>
                  ))}
                  {(!report.attendees || report.attendees.length === 0) && (
                    <p className="text-sm text-muted-foreground">No attendees recorded.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AI Summary */}
            {notes.summary && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-indigo-500" /> AI Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-foreground/90">{notes.summary}</p>
                </CardContent>
              </Card>
            )}

            <NoteList icon={<ListChecks className="h-4 w-4" />} title="Key Points" items={toStringList(notes.keyPoints)} />
            <NoteList icon={<Gavel className="h-4 w-4" />} title="Decisions" items={toStringList(notes.decisions)} />

            {/* Action items */}
            {actionItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckSquare className="h-4 w-4" /> Action Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-xl border border-border/60">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Task</th>
                          <th className="px-3 py-2 font-medium">Owner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {actionItems.map((ai, i) => (
                          <tr key={i} className="border-b border-border/40 last:border-0">
                            <td className="px-3 py-2 break-words">{ai.task}</td>
                            <td className="px-3 py-2 text-muted-foreground">{ai.ownerName || "Unassigned"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Important timestamps */}
            {stamps.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="h-4 w-4" /> Important Timestamps
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {stamps.map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="shrink-0 border-border/60 font-mono text-[10px]">
                          {typeof s === "string" ? "" : s?.timestamp || ""}
                        </Badge>
                        <span className="break-words">{typeof s === "string" ? s : s?.label || ""}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Transcript */}
            {transcripts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" /> Transcript ({transcripts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            )}

            {/* Recordings */}
            {recordings.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recordings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recordings.map((r, i) => {
                    const url = r?.storageUrl ? resolveMediaUrl(r.storageUrl) : null;
                    if (!url) return null;
                    const isVideo = /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
                    return (
                      <div key={r.id || i}>
                        {isVideo ? (
                          <video src={url} controls className="w-full rounded-xl border border-border/60" preload="metadata" />
                        ) : (
                          <audio src={url} controls className="w-full" preload="metadata" />
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {!notes.summary && transcripts.length === 0 && recordings.length === 0 && (
              <Card>
                <CardContent className={cn("py-10 text-center text-sm text-muted-foreground")}>
                  No AI notes, transcript or recordings are available for this meeting yet.
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
 * Route adapter for /meetings/:meetingCode — the URL segment can be a meeting
 * UUID (detail page) or a join code (JoinMeeting flow).
 */
export function MeetingDetailRoute() {
  const { meetingCode } = useParams<{ meetingCode: string }>();
  if (meetingCode && UUID_RE.test(meetingCode)) {
    return <MeetingDetail />;
  }
  return <JoinMeeting />;
}
