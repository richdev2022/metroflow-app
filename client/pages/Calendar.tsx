import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  Users,
  Video,
  Sparkles,
  Repeat,
  Globe,
} from "lucide-react";
import { useMeetingsRange } from "@/lib/meetings-chat-calls";
import type { Meeting } from "@shared/api";
import ScheduleMeetingDialog from "@/components/ScheduleMeetingDialog";

const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/20",
  ongoing: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20",
  completed: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-400/30 hover:bg-slate-500/20",
  cancelled: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30 hover:bg-red-500/20 line-through",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function toLocalDateKey(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function recurrenceLabel(meeting: Meeting): string | null {
  if (!meeting.recurrenceRule) return null;
  try {
    const rule = JSON.parse(meeting.recurrenceRule);
    const every = rule.interval && rule.interval > 1 ? rule.interval : null;
    switch (rule.frequency) {
      case "DAILY": return every ? `Every ${every} days` : "Daily";
      case "WEEKLY": return every ? `Every ${every} weeks` : "Weekly";
      case "MONTHLY": return every ? `Every ${every} months` : "Monthly";
      case "YEARLY": return every ? `Every ${every} years` : "Yearly";
      case "CUSTOM": return "Custom schedule";
      default: return null;
    }
  } catch {
    return null;
  }
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-based
  const [selectedDay, setSelectedDay] = useState<string>(toLocalDateKey(today));
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);

  const monthStart = new Date(viewYear, viewMonth, 1);
  const monthEnd = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59, 999);

  // Fetch a padded window so meetings spilling across month edges still show.
  const fetchFrom = useMemo(() => {
    const d = new Date(monthStart);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, [viewYear, viewMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTo = useMemo(() => {
    const d = new Date(monthEnd);
    d.setDate(d.getDate() + 7);
    return d.toISOString();
  }, [viewYear, viewMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useMeetingsRange(fetchFrom, fetchTo);

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const meeting of data?.meetings ?? []) {
      const start = new Date(meeting.startTime);
      if (isNaN(start.getTime())) continue;
      const key = toLocalDateKey(start);
      const list = map.get(key) ?? [];
      list.push(meeting);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }
    return map;
  }, [data]);

  // Build the 6-week grid of day cells
  const gridDays = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const cells: Array<{ date: Date; inMonth: boolean }> = [];
    const start = new Date(viewYear, viewMonth, 1 - firstWeekday);
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({ date: d, inMonth: d.getMonth() === viewMonth });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const isToday = (d: Date) => toLocalDateKey(d) === toLocalDateKey(new Date());

  const goPrevMonth = () => {
    const m = viewMonth - 1;
    if (m < 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(m);
    }
  };

  const goNextMonth = () => {
    const m = viewMonth + 1;
    if (m > 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(m);
    }
  };

  const goToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDay(toLocalDateKey(now));
  };

  const selectedDayMeetings = meetingsByDay.get(selectedDay) ?? [];

  /** Default start for a newly scheduled day: 09:00 (next hour for today). */
  const defaultScheduleStart = (date: Date): Date => {
    const d = new Date(date);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      d.setHours(Math.min(now.getHours() + 1, 23), 0, 0, 0);
    } else {
      d.setHours(9, 0, 0, 0);
    }
    return d;
  };

  /**
   * Day-cell click behaviour:
   *  - exactly one appointment → open that meeting straight away
   *  - several appointments  → focus the day (the side panel lists them all)
   *  - empty day             → prompt the schedule dialog pre-filled with it
   */
  const handleDayClick = (date: Date, dayMeetings: Meeting[]) => {
    setSelectedDay(toLocalDateKey(date));
    if (dayMeetings.length === 1) {
      const m = dayMeetings[0];
      if (m.meetingCode) navigate(`/meetings/${m.meetingCode}`);
      return;
    }
    if (dayMeetings.length === 0) {
      setScheduleDate(defaultScheduleStart(date));
      setScheduleOpen(true);
    }
  };

  const openScheduleFor = (date: Date) => {
    setSelectedDay(toLocalDateKey(date));
    setScheduleDate(defaultScheduleStart(date));
    setScheduleOpen(true);
  };

  const participantCount = (meeting: Meeting) =>
    (meeting.attendees?.length ?? 0) + (meeting.guests?.length ?? 0);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                <CalendarDays className="h-5 w-5" />
              </span>
              Calendar
            </h1>
            <p className="text-muted-foreground mt-2">
              Your scheduled meetings at a glance — reminders go out 60 and 15 minutes before start
            </p>
          </div>
          <Button
            onClick={() => openScheduleFor(today)}
            className="bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-700 hover:to-indigo-600 shadow-lg shadow-blue-500/20"
          >
            <Video className="h-4 w-4 mr-2" />
            New meeting
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-lg font-semibold">
                {monthStart.toLocaleString([], { month: "long" })}{" "}
                <span className="text-muted-foreground font-normal">{viewYear}</span>
              </h2>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="icon" onClick={goPrevMonth} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToday} className="h-8">
                  Today
                </Button>
                <Button variant="ghost" size="icon" onClick={goNextMonth} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <CardContent className="p-2 sm:p-4">
              <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1">
                {WEEKDAY_HEADERS.map((label) => (
                  <div key={label} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide py-1.5">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {gridDays.map(({ date, inMonth }) => {
                  const key = toLocalDateKey(date);
                  const dayMeetings = meetingsByDay.get(key) ?? [];
                  const selected = key === selectedDay;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleDayClick(date, dayMeetings)}
                      title={
                        dayMeetings.length === 1
                          ? `Open "${dayMeetings[0].title}"`
                          : dayMeetings.length > 1
                            ? `${dayMeetings.length} meetings on this day`
                            : `Schedule a meeting on ${date.toLocaleDateString()}`
                      }
                      className={`min-h-[72px] sm:min-h-[96px] rounded-lg border p-1 sm:p-1.5 flex flex-col gap-1 text-left transition-all ${
                        inMonth ? "bg-background" : "bg-muted/30 opacity-60"
                      } ${selected ? "ring-2 ring-blue-500 border-blue-500/40" : "hover:bg-accent/50"} ${
                        isToday(date) ? "border-blue-500/50" : "border-border/60"
                      }`}
                    >
                      <span
                        className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday(date) ? "bg-blue-600 text-white" : ""
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      <div className="flex-1 w-full space-y-0.5 overflow-hidden">
                        {dayMeetings.slice(0, 2).map((meeting) => (
                          <div
                            key={meeting.id}
                            className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate ${STATUS_STYLES[meeting.status] || STATUS_STYLES.scheduled}`}
                            title={meeting.title}
                          >
                            {meeting.status !== "cancelled" && (
                              <span className="font-semibold">{formatTime(meeting.startTime)} </span>
                            )}
                            {meeting.title}
                          </div>
                        ))}
                        {dayMeetings.length > 2 && (
                          <div className="text-[10px] text-muted-foreground px-1">
                            +{dayMeetings.length - 2} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm">
                  {new Date(`${selectedDay}T12:00:00`).toLocaleDateString([], {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {selectedDayMeetings.length} meeting{selectedDayMeetings.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <CardContent className="p-3 space-y-2 max-h-[420px] overflow-y-auto">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
                ) : selectedDayMeetings.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No meetings on this day</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1"
                      onClick={() => {
                        const [y, m, d] = selectedDay.split("-").map(Number);
                        if (y && m && d) openScheduleFor(new Date(y, m - 1, d));
                      }}
                    >
                      <Video className="h-3.5 w-3.5 mr-1.5" />
                      Schedule a meeting on this day
                    </Button>
                  </div>
                ) : (
                  selectedDayMeetings.map((meeting) => {
                    const repeatLabel = recurrenceLabel(meeting);
                    return (
                      <button
                        key={meeting.id}
                        type="button"
                        onClick={() => navigate(`/meetings/${meeting.meetingCode}`)}
                        className="w-full text-left rounded-lg border p-3 hover:bg-accent/60 transition-colors space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-sm leading-snug">{meeting.title}</span>
                          <Badge className={`text-[10px] uppercase border shrink-0 ${STATUS_STYLES[meeting.status] || STATUS_STYLES.scheduled}`}>
                            {meeting.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(meeting.startTime)}
                            {meeting.endTime && ` – ${formatTime(meeting.endTime)}`}
                          </span>
                          {participantCount(meeting) > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {participantCount(meeting)}
                            </span>
                          )}
                          {repeatLabel && (
                            <span className="flex items-center gap-1">
                              <Repeat className="h-3 w-3" />
                              {repeatLabel}
                            </span>
                          )}
                          {meeting.isInstant && (
                            <span className="flex items-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              Instant
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {meeting.timezone || "UTC"}
                          </span>
                        </div>
                        {meeting.status === "scheduled" && new Date(meeting.startTime).getTime() > Date.now() && (
                          <div className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                            Reminder scheduled 15 min before start
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2.5">
                <h3 className="text-sm font-semibold">Legend</h3>
                {[
                  { label: "Scheduled", cls: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
                  { label: "Ongoing (live now)", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
                  { label: "Completed", cls: "border-slate-400/30 bg-slate-500/10 text-slate-600 dark:text-slate-300" },
                  { label: "Cancelled", cls: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" },
                ].map(({ label, cls }) => (
                  <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`inline-block h-3 w-6 rounded border ${cls}`} />
                    {label}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Schedule dialog — opened from empty-day clicks, the day panel and the header button */}
        <ScheduleMeetingDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          initialDate={scheduleDate}
        />
      </div>
    </Layout>
  );
}
