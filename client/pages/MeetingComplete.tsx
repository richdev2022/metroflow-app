import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileAudio,
  FileVideo,
  LayoutDashboard,
  Loader2,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { getApiMessage, unwrapApiData } from "@/lib/api-response";
import { buildMeetingReportPdf, fmtDateTime, type MeetingReportData } from "@/lib/report-pdf";
import { resolveMediaUrl } from "@/lib/media-url";

function initialsOf(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function durationLabel(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!isFinite(ms) || ms <= 0) return null;
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "Under a minute";
}

const SUMMARY_POLL_MS = 8000;
const SUMMARY_POLL_MAX = 15; // ~2 minutes of patient polling

/**
 * Post-meeting completion screen — shown the moment a user leaves or ends a
 * meeting. The hero renders INSTANTLY (no waiting on the network); attendees,
 * transcript and recordings appear as soon as the report arrives; and the AI
 * summary auto-generates + refreshes on its own until MetricAi finishes, so
 * the page never feels stuck while notes are being written.
 */
export default function MeetingComplete() {
  const { meetingId } = useParams<{ meetingId?: string }>();
  const id = meetingId || "";
  const navigate = useNavigate();
  const { toast } = useToast();
  const [report, setReport] = useState<MeetingReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  /** MetricAi is actively writing the summary (generate kicked off / polling). */
  const [summaryWriting, setSummaryWriting] = useState(false);
  const [summaryTries, setSummaryTries] = useState(0);
  const generateStartedRef = useRef<string | null>(null);

  const loadReport = useCallback(
    (silent = false) => {
      if (!id) return;
      let cancelled = false;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      api
        .get(`/meetings/${id}/report`)
        .then((res) => {
          if (cancelled) return;
          setReport(unwrapApiData<MeetingReportData>(res.data, "Failed to load meeting summary"));
        })
        .catch((err) => {
          if (cancelled || silent) return;
          setError(getApiMessage(err, "Failed to load the meeting summary."));
        })
        .finally(() => {
          if (!cancelled && !silent) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    },
    [id],
  );

  useEffect(() => {
    const cleanup = loadReport();
    return cleanup;
  }, [loadReport]);

  // ------------------------------------------------------------------
  // AI summary pipeline — when the report has no notes yet, kick off
  // generation once, then poll the report every 8s until MetricAi is
  // done (or ~2 minutes elapse). Silent refreshes never flash loaders.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!id) return;
    if (report?.notes?.summary) {
      setSummaryWriting(false);
      return;
    }
    if (!report) return;

    // One generation attempt per meeting per visit.
    if (generateStartedRef.current !== id) {
      generateStartedRef.current = id;
      api
        .post(`/meetings/${id}/notes/generate`)
        .catch(() => {
          /* 409/503/"too thin transcript" — polling below still picks up
             notes if the end-of-meeting job lands first. */
        });
    }
    setSummaryWriting(true);
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      setSummaryTries(tries);
      if (tries > SUMMARY_POLL_MAX) {
        setSummaryWriting(false);
        clearInterval(timer);
        return;
      }
      loadReport(true);
    }, SUMMARY_POLL_MS);
    return () => clearInterval(timer);
  }, [report, id, loadReport]);

  const handleDownloadReport = async () => {
    if (!report) return;
    setDownloading(true);
    try {
      const doc = await buildMeetingReportPdf(report);
      await doc.save(
        `MetriCorex-Meeting-Report-${report.meeting?.meetingCode || report.meeting?.id || id}.pdf`,
      );
      toast({ title: "Report downloaded" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: getApiMessage(err, "Could not generate the PDF report."),
      });
    } finally {
      setDownloading(false);
    }
  };

  const meeting = report?.meeting;
  const summary = report?.notes?.summary;
  const transcripts = report?.transcripts || [];
  const recordings = report?.recordings || [];
  const attendees = report?.attendees || [];
  const duration = durationLabel(meeting?.startTime, meeting?.endTime);

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {/* Back row */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate("/meetings")} aria-label="Back to meetings">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm text-muted-foreground">Back to meetings</span>
        </div>

        {/* Hero — renders instantly, upgrades when the report arrives */}
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-xl shadow-blue-500/20">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 backdrop-blur">
              <CheckCircle2 className="h-9 w-9" />
            </span>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold sm:text-3xl">Meeting ended</h1>
              <p className="text-white/80">
                {loading ? "Wrapping things up…" : `${meeting?.title || "Your meeting"} has wrapped up — here's everything from it.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/90">
              {meeting?.startTime && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {fmtDateTime(meeting.startTime)}
                </span>
              )}
              {duration && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  {duration}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {attendees.length} participant{attendees.length === 1 ? "" : "s"}
              </span>
              {meeting?.meetingCode && (
                <Badge className="border-0 bg-white/20 text-white hover:bg-white/20">
                  Code {meeting.meetingCode}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                className="rounded-xl bg-white text-blue-700 hover:bg-white/90"
                disabled={!report || downloading}
                onClick={handleDownloadReport}
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download meeting report
              </Button>
              <Button
                variant="outline"
                className="rounded-xl border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => navigate("/calendar")}
              >
                <CalendarDays className="h-4 w-4 mr-2" />
                View calendar
              </Button>
              <Button
                variant="outline"
                className="rounded-xl border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => navigate("/dashboard")}
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <Card>
            <CardContent className="space-y-3 py-8">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
              <p className="flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing meeting notes…
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && error && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={() => loadReport()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && report && (
          <>
            {/* Attendees */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" /> Attendees ({attendees.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {attendees.map((a, i) => (
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
                  {attendees.length === 0 && (
                    <p className="text-sm text-muted-foreground">No attendees recorded.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AI Summary — auto-generates and refreshes itself */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-indigo-500" /> AI Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary ? (
                  <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
                ) : summaryWriting ? (
                  <div className="space-y-2.5">
                    <div className="h-3.5 w-11/12 animate-pulse rounded bg-muted" />
                    <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
                    <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                    <p className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                      MetricAi is writing the summary — usually ready within a minute. This section updates by itself
                      {summaryTries > 1 ? ` (checked ${summaryTries}×)` : ""}.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      No AI summary yet — meetings need a few minutes of conversation for MetricAi to work with.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => { generateStartedRef.current = null; setSummaryWriting(true); loadReport(true); }}>
                      <Sparkles className="mr-2 h-3.5 w-3.5" /> Try generating again
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transcript */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Video className="h-4 w-4" /> Transcript
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {transcripts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Transcript will appear here once processing finishes.
                  </p>
                ) : (
                  <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                    {transcripts.map((t, i) => (
                      <div key={t.id || i} className="rounded-lg border border-border/60 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t.speakerName || "Speaker"}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed">{t.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recordings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {recordings.some((r) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(r.storageUrl || "")) ? (
                    <FileVideo className="h-4 w-4" />
                  ) : (
                    <FileAudio className="h-4 w-4" />
                  )}
                  Recordings ({recordings.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recordings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recordings were captured for this meeting.</p>
                ) : (
                  recordings.map((r, i) => (
                    <a
                      key={r.id || i}
                      href={r.storageUrl ? resolveMediaUrl(r.storageUrl) : "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-accent/60"
                    >
                      <span className="font-medium">Recording {i + 1}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {r.duration ? `${Math.round(r.duration / 60)} min · ` : ""}
                        <Download className="h-3.5 w-3.5" />
                      </span>
                    </a>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
