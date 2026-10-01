import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TimezoneDropdown from "@/components/TimezoneDropdown";
import { ParticipantPicker } from "@/components/ParticipantPicker";
import { useCreateMeeting } from "@/lib/meetings-chat-calls";
import { useToast } from "@/components/ui/use-toast";
import { getApiMessage } from "@/lib/api-response";
import { Clock, Loader2, Lock, Repeat, Sparkles, Users } from "lucide-react";
import type { CreateMeetingInput, Meeting, MeetingFrequency, MeetingRecurrenceInput, TeamMember } from "@shared/api";
import { api } from "@/lib/api-client";
import { unwrapApiData } from "@/lib/api-response";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local datetime-local value for a Date ("YYYY-MM-DDTHH:mm"). */
function toDateTimeLocalValue(d: Date): string {
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

/**
 * Google-style schedule-meeting dialog — shared by the Meetings page and the
 * Calendar page. Fully self-contained: team lookup, participants + guests,
 * start/end, timezone, repeat (incl. custom weekday pattern), and meeting
 * options. `initialDate` pre-fills the start (used when clicking an empty
 * calendar day).
 */
export function ScheduleMeetingDialog({
  open,
  onOpenChange,
  initialDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the start time with this day (e.g. a clicked calendar date). */
  initialDate?: Date | null;
  /** Called after a meeting was created successfully. */
  onCreated?: (meeting: Meeting) => void;
}) {
  const { toast } = useToast();
  const createMeeting = useCreateMeeting();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const [meetingForm, setMeetingForm] = useState<CreateMeetingInput>({
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isInstant: false,
    maxParticipants: 100,
    waitingRoomEnabled: false,
    recordingEnabled: false,
    screenSharingEnabled: true,
    attendeeIds: [],
  });
  const [guestEmails, setGuestEmails] = useState<string[]>([]);
  const [frequency, setFrequency] = useState<MeetingFrequency | "NONE">("NONE");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");

  useEffect(() => {
    if (!open) return;
    api
      .get("/team")
      .then((res) => setTeamMembers(unwrapApiData<TeamMember[]>(res.data, "Failed to fetch team members")))
      .catch(() => undefined); // picker still works without the roster
  }, [open]);

  // Re-apply the prefill whenever the dialog (re)opens with a date.
  useEffect(() => {
    if (!open) return;
    setMeetingForm((prev) => ({
      ...prev,
      title: "",
      startTime: initialDate ? toDateTimeLocalValue(initialDate) : "",
      endTime: "",
      attendeeIds: [],
    }));
    setGuestEmails([]);
    setFrequency("NONE");
    setRecurrenceInterval(1);
    setCustomDays([]);
    setRecurrenceEndDate("");
  }, [open, initialDate]);

  const buildRecurrence = (): MeetingRecurrenceInput | undefined => {
    if (frequency === "NONE") return undefined;
    const rec: MeetingRecurrenceInput = {
      frequency,
      interval: Math.max(1, Math.min(365, recurrenceInterval || 1)),
    };
    if (frequency === "CUSTOM" && customDays.length > 0) {
      rec.customDays = [...customDays].sort();
    }
    if (recurrenceEndDate) {
      // end-of-day so the last occurrence inside the chosen day still counts
      rec.endDate = new Date(`${recurrenceEndDate}T23:59:59`).toISOString();
    }
    return rec;
  };

  const handleCreateMeeting = async () => {
    if (!meetingForm.title || !meetingForm.startTime) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please add a title and a start time",
      });
      return;
    }
    if (frequency === "CUSTOM" && customDays.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pick at least one weekday for the custom repeat",
      });
      return;
    }
    setIsProcessing(true);
    try {
      const created = await createMeeting.mutateAsync({
        ...meetingForm,
        startTime: meetingForm.startTime ? new Date(meetingForm.startTime).toISOString() : "",
        endTime: meetingForm.endTime ? new Date(meetingForm.endTime).toISOString() : undefined,
        guestEmails,
        recurrence: buildRecurrence(),
      });
      onOpenChange(false);
      toast({
        title: "Meeting scheduled",
        description:
          created?.occurrencesCreated && created.occurrencesCreated > 1
            ? `Created ${created.occurrencesCreated} occurrences of "${created.title}" — invitations + reminders are on the way`
            : "Invitations and reminders have been sent to participants",
      });
      if (created) onCreated?.(created);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to create meeting"),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            New scheduled meeting
          </DialogTitle>
          <DialogDescription>
            Add participants, pick a time, and choose how often it repeats — invitations and reminders go out automatically
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-4 pr-1">
          <Input
            value={meetingForm.title}
            onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })}
            placeholder="Add title"
            className="h-auto border-none bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          />
          <Textarea
            value={meetingForm.description}
            onChange={(e) => setMeetingForm({ ...meetingForm, description: e.target.value })}
            placeholder="Add description (optional)"
            rows={2}
            className="resize-none"
          />

          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Participants</Label>
            <ParticipantPicker
              teamMembers={teamMembers}
              selectedAttendeeIds={meetingForm.attendeeIds}
              guests={guestEmails}
              onAttendeesChange={(ids) => setMeetingForm({ ...meetingForm, attendeeIds: ids })}
              onGuestsChange={setGuestEmails}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sm-startTime" className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Start</Label>
              <Input
                id="sm-startTime"
                type="datetime-local"
                value={meetingForm.startTime}
                onChange={(e) => setMeetingForm({ ...meetingForm, startTime: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sm-endTime" className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> End <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="sm-endTime"
                type="datetime-local"
                value={meetingForm.endTime}
                onChange={(e) => setMeetingForm({ ...meetingForm, endTime: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sm-timezone">Timezone</Label>
            <TimezoneDropdown
              value={meetingForm.timezone}
              onChange={(timezone) => setMeetingForm({ ...meetingForm, timezone })}
            />
          </div>

          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5" /> Repeat</Label>
            <Select
              value={frequency}
              onValueChange={(value) => setFrequency(value as MeetingFrequency | "NONE")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Does not repeat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Does not repeat</SelectItem>
                <SelectItem value="DAILY">Daily</SelectItem>
                <SelectItem value="WEEKLY">Weekly on {meetingForm.startTime ? WEEKDAY_LABELS[new Date(meetingForm.startTime).getDay()] : "same day"}</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="YEARLY">Yearly</SelectItem>
                <SelectItem value="CUSTOM">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {frequency !== "NONE" && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Every</span>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(parseInt(e.target.value) || 1)}
                    className="w-20 h-8"
                  />
                  <span className="text-sm text-muted-foreground">
                    {frequency === "DAILY" ? "days" : frequency === "WEEKLY" || frequency === "CUSTOM" ? "weeks" : frequency === "MONTHLY" ? "months" : "years"}
                  </span>
                </div>
                {frequency === "CUSTOM" && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">Repeat on</span>
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAY_LABELS.map((label, idx) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() =>
                            setCustomDays((days) =>
                              days.includes(idx) ? days.filter((d) => d !== idx) : [...days, idx],
                            )
                          }
                          className={`h-8 w-11 rounded-full text-xs font-medium transition-colors ${
                            customDays.includes(idx)
                              ? "bg-blue-600 text-white"
                              : "bg-background border text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Until</span>
                  <Input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    className="w-44 h-8"
                  />
                  <span className="text-xs text-muted-foreground">(optional)</span>
                </div>
              </div>
            )}
          </div>

          <details className="group rounded-lg border">
            <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium flex items-center gap-2">
              <Lock className="h-3.5 w-3.5" /> Meeting options
              <span className="ml-auto text-xs text-muted-foreground">password, waiting room, recording</span>
            </summary>
            <div className="px-3 pb-3 space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sm-password">Password (optional)</Label>
                <Input
                  id="sm-password"
                  type="password"
                  value={meetingForm.password || ""}
                  onChange={(e) => setMeetingForm({ ...meetingForm, password: e.target.value })}
                  placeholder="Enter meeting password"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="sm-waitingRoom" className="cursor-pointer">Waiting room</Label>
                <Switch
                  id="sm-waitingRoom"
                  checked={meetingForm.waitingRoomEnabled}
                  onCheckedChange={(checked) => setMeetingForm({ ...meetingForm, waitingRoomEnabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="sm-recording" className="cursor-pointer">Recording</Label>
                <Switch
                  id="sm-recording"
                  checked={meetingForm.recordingEnabled}
                  onCheckedChange={(checked) => setMeetingForm({ ...meetingForm, recordingEnabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="sm-screenSharing" className="cursor-pointer">Screen sharing</Label>
                <Switch
                  id="sm-screenSharing"
                  checked={meetingForm.screenSharingEnabled}
                  onCheckedChange={(checked) => setMeetingForm({ ...meetingForm, screenSharingEnabled: checked })}
                />
              </div>
            </div>
          </details>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateMeeting}
            disabled={isProcessing || !meetingForm.title.trim() || !meetingForm.startTime}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Schedule meeting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ScheduleMeetingDialog;
