import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout";
import { startCall } from "@/lib/active-call";
import TimezoneDropdown from "@/components/TimezoneDropdown";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  Edit,
  Plus,
  Trash2,
  Users,
  Loader2,
  Video,
  Info,
  Copy,
  Check,
  X,
  Lock,
  Repeat,
  UserPlus,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  useMeetings,
  useCreateMeeting,
  useUpdateMeeting,
  useDeleteMeeting,
  useJoinMeeting,
  useLeaveMeeting,
} from "@/lib/meetings-chat-calls";
import { Meeting, CreateMeetingInput, UpdateMeetingInput, MeetingFrequency, MeetingRecurrenceInput } from "@shared/api";
import { ScheduleMeetingDialog } from "@/components/ScheduleMeetingDialog";
import { TeamMember } from "@shared/api";
import { api } from "@/lib/api-client";
import { getApiMessage, unwrapApiData } from "@/lib/api-response";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export default function Meetings() {
  const navigate = useNavigate();
  const {
    data: meetingsData,
    isLoading: meetingsLoading,
    error: meetingsError,
  } = useMeetings();
  const createMeeting = useCreateMeeting();
  const [instantStarting, setInstantStarting] = useState(false);
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();
  const joinMeeting = useJoinMeeting();
  const leaveMeeting = useLeaveMeeting();
  const { toast } = useToast();

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isMeetingRoomOpen, setIsMeetingRoomOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [passwordMeeting, setPasswordMeeting] = useState<Meeting | null>(null);
  const [joinPassword, setJoinPassword] = useState("");
  const [joinPasswordError, setJoinPasswordError] = useState("");

  const [editForm, setEditForm] = useState<UpdateMeetingInput>({});
  // Meetings list status filter (must live above any early returns — Rules of Hooks)
  const [statusFilter, setStatusFilter] = useState<"all" | "upcoming" | "completed">("all");

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    if (meetingsError) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(meetingsError, "Failed to get meetings"),
      });
    }
  }, [meetingsError, toast]);

  const fetchTeamMembers = async () => {
    api
      .get("/team")
      .then((res) => {
        setTeamMembers(unwrapApiData<TeamMember[]>(res.data, "Failed to fetch team members"));
      })
      .catch((err) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: getApiMessage(err, "Failed to fetch team members"),
        });
      });
  };

  // Google-style INSTANT meeting: create (isInstant=true) then jump straight
  // into the room so the host can invite people from inside the call.
  const handleStartInstantMeeting = async () => {
    setInstantStarting(true);
    try {
      const created = await createMeeting.mutateAsync({
        title: `${localStorage.getItem("userName") || "Instant"}'s meeting`,
        isInstant: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        maxParticipants: 100,
        waitingRoomEnabled: false,
        recordingEnabled: false,
        screenSharingEnabled: true,
        attendeeIds: [],
      });
      if (created) {
        handleJoinMeeting(created);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to start an instant meeting"),
      });
    } finally {
      setInstantStarting(false);
    }
  };

  const handleEditMeeting = async () => {
    if (!selectedMeeting) return;
    setIsProcessing(true);
    try {
      await updateMeeting.mutateAsync({
        meetingId: selectedMeeting.id,
        data: {
          ...editForm,
          startTime: editForm.startTime ? toApiDateTime(editForm.startTime) : undefined,
          endTime: editForm.endTime ? toApiDateTime(editForm.endTime) : undefined,
        },
      });
      setIsEditDialogOpen(false);
      setSelectedMeeting(null);
      setEditForm({});
      toast({
        title: "Meeting updated",
        description: "Your meeting has been updated successfully",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to update meeting"),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteMeeting = async () => {
    if (!selectedMeeting) return;
    setIsProcessing(true);
    try {
      await deleteMeeting.mutateAsync(selectedMeeting.id);
      setIsDeleteDialogOpen(false);
      setSelectedMeeting(null);
      toast({
        title: "Meeting deleted",
        description: "Your meeting has been deleted",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to delete meeting"),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openEditDialog = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setEditForm({
      title: meeting.title,
      description: meeting.description,
      startTime: toDateTimeLocalValue(meeting.startTime),
      endTime: toDateTimeLocalValue(meeting.endTime),
      timezone: meeting.timezone,
      attendeeIds: meeting.attendees?.map((a) => a.userId) ?? [],
      status: meeting.status,
      // SEED THE CONFIG FLAGS — they were previously undefined, so the edit
      // dialog's Waiting-room/Recording/Screen-sharing toggles always showed
      // OFF even for meetings that had them ON ("configuration lost" bug).
      waitingRoomEnabled: (meeting as any).waitingRoomEnabled ?? false,
      recordingEnabled: (meeting as any).recordingEnabled ?? false,
      screenSharingEnabled: (meeting as any).screenSharingEnabled ?? true,
      maxParticipants: (meeting as any).maxParticipants ?? 100,
      password: (meeting as any).password || "",
    });
    setIsEditDialogOpen(true);
  };

  const openDetailDialog = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setIsDetailDialogOpen(true);
  };

  const CURRENT_USER_ID = () => localStorage.getItem('userId') || '';
  const isCurrentUserHost = (meeting: Meeting) =>
    meeting.hostId === CURRENT_USER_ID() || (meeting as any).coHostId === CURRENT_USER_ID();
  const isCurrentUserAttendee = (meeting: Meeting) =>
    (meeting.attendees ?? []).some((a) => a.userId === CURRENT_USER_ID());
  const isCurrentUserAccepted = (meeting: Meeting) =>
    (meeting.attendees ?? []).some(
      (a) => a.userId === CURRENT_USER_ID() && a.status === 'accepted'
    );

  const promptForMeetingPassword = useCallback(
    (meeting: Meeting, message = "") => {
      setPasswordMeeting(meeting);
      setJoinPassword("");
      setJoinPasswordError(message);
    },
    []
  );

  const handleJoinMeeting = useCallback(
    async (meeting: Meeting, password?: string) => {
      if (meeting.password && !isCurrentUserHost(meeting) && !password) {
        promptForMeetingPassword(meeting);
        return;
      }

      if (
        meeting.status === 'completed' ||
        meeting.status === 'cancelled'
      ) {
        toast({
          variant: "destructive",
          title: "Meeting Unavailable",
          description:
            meeting.status === 'completed'
              ? "This meeting has already ended."
              : "This meeting has been cancelled.",
        });
        return;
      }

      setIsProcessing(true);
      try {
        const joinedMeeting = await joinMeeting.mutateAsync({
          meetingId: meeting.id,
          password,
        });

        setSelectedMeeting(joinedMeeting);
        setPasswordMeeting(null);
        setJoinPassword("");
        setJoinPasswordError("");

        toast({
          title: "Joined Meeting",
          description: "You have joined the meeting",
        });

        // Join succeeded — launch the room (App-root ActiveCallHost).
        launchMeetingRoom(joinedMeeting);
      } catch (err: any) {
        const code = err?.response?.data?.code;
        if (code === "PASSWORD_REQUIRED" || code === "INVALID_PASSWORD") {
          promptForMeetingPassword(
            meeting,
            code === "INVALID_PASSWORD"
              ? "Invalid password. Please try again."
              : ""
          );
          return;
        }
        if (code === "MAX_PARTICIPANTS_REACHED") {
          toast({
            variant: "destructive",
            title: "Meeting Full",
            description:
              "This meeting has reached its maximum participant capacity.",
          });
          return;
        }

        toast({
          variant: "destructive",
          title: "Error",
          description: getApiMessage(err, "Failed to join meeting"),
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [joinMeeting, promptForMeetingPassword, toast]
  );

  const openMeetingRoom = useCallback(
    (meeting: Meeting) => {
      if (!isCurrentUserHost(meeting) && !isCurrentUserAccepted(meeting)) {
        handleJoinMeeting(meeting);
        return;
      }
      if (isCurrentUserHost(meeting)) {
        handleJoinMeeting(meeting);
        return;
      }
      setSelectedMeeting(meeting);
      launchMeetingRoom(meeting);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleJoinMeeting]
  );

  const handleLeaveMeeting = useCallback(
    async (meeting: Meeting) => {
      setIsProcessing(true);
      try {
        await leaveMeeting.mutateAsync(meeting.id);
        setIsMeetingRoomOpen(false);
        toast({
          title: "Left Meeting",
          description: "You have left the meeting",
        });
        // Post-meeting completion screen: details, AI summary, transcript,
        // recordings and the downloadable report in one place.
        navigate(`/meetings/complete/${meeting.id}`);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Error",
          description: getApiMessage(err, "Failed to leave meeting"),
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [leaveMeeting, navigate, toast]
  );

  const transformAttendeesToInitialParticipants = (meeting: Meeting) =>
    (meeting.attendees ?? []).map((a) => ({
      userId: a.userId,
      status: a.status === 'accepted'
        ? 'joined' as const
        : (a.status === 'declined' || a.status === 'tentative'
            ? 'invited' as const
            : 'invited' as const),
      isHost: meeting.hostId === a.userId || (meeting as any).coHostId === a.userId,
      userName: teamMembers.find((m) => m.id === a.userId)?.name,
    }));

  // The CallRoom instance lives in the App root (ActiveCallHost) so it can be
  // minimized into a floating bubble and survive navigation.
  const launchMeetingRoom = useCallback(
    (meeting: Meeting) => {
      startCall(
        {
          roomId: meeting.meetingCode,
          meetingId: meeting.id,
          callType: "video",
          onLeave: () => {
            handleLeaveMeeting(meeting);
          },
          userName: localStorage.getItem("userName") || "User",
          isHost: isCurrentUserHost(meeting),
          waitingRoomEnabled: meeting.waitingRoomEnabled,
          calling: (meeting as any)?.calling || null,
          title: meeting.title,
          inviteDetails: {
            title: meeting.title,
            code: meeting.meetingCode,
            password: isCurrentUserHost(meeting) ? (meeting as any).password || null : null,
            waitingRoomEnabled: meeting.waitingRoomEnabled,
            startTime: meeting.startTime,
          },
          teamMembers,
          currentParticipantIds: (meeting.attendees ?? []).map((attendee) => attendee.userId),
          initialParticipants: transformAttendeesToInitialParticipants(meeting),
        },
        "video"
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleLeaveMeeting, isCurrentUserHost, teamMembers]
  );

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const toApiDateTime = (dateStr: string) => {
    return dateStr ? new Date(dateStr).toISOString() : dateStr;
  };

  const toDateTimeLocalValue = (dateStr?: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const offsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  };

  const TeamMemberMultiSelect = ({
    selected,
    onChange,
    placeholder = "Select attendees...",
  }: {
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
  }) => {
    const [open, setOpen] = useState(false);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <div className="flex flex-wrap gap-1">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                selected.map((id) => {
                  const member = teamMembers.find((d) => d.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="text-xs">
                      {member?.name}
                      <button
                        type="button"
                        aria-label={`Remove ${member?.name || 'attendee'}`}
                        className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChange(selected.filter((s) => s !== id));
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })
              )}
            </div>
            <Check className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command>
            <CommandInput placeholder="Search attendees..." />
            <CommandList>
              <CommandEmpty>No team members found.</CommandEmpty>
              <CommandGroup>
                {teamMembers.map((member) => (
                  <CommandItem
                    key={member.id}
                    onSelect={() => {
                      const newSelected = selected.includes(member.id)
                        ? selected.filter((s) => s !== member.id)
                        : [...selected, member.id];
                      onChange(newSelected);
                    }}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${
                        selected.includes(member.id) ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    {member.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  if (meetingsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  // FIX: Normalize null attendees to [] so .length and .map() never throw
  const meetings = (meetingsData?.meetings || []).map((m: Meeting) => ({
    ...m,
    attendees: m.attendees ?? [],
  }));

  // Redesigned list: status filter + live detection + stats
  const isMeetingLive = (m: Meeting) => {
    if (m.status === "ongoing") return true;
    const start = new Date(m.startTime).getTime();
    const end = m.endTime ? new Date(m.endTime).getTime() : start + 60 * 60000;
    return start <= Date.now() && Date.now() <= end;
  };
  const upcomingCount = meetings.filter(
    (m) => m.status !== "completed" && m.status !== "cancelled" && new Date(m.startTime).getTime() > Date.now(),
  ).length;
  const liveCount = meetings.filter(isMeetingLive).length;
  const completedCount = meetings.filter((m) => m.status === "completed").length;
  const filteredMeetings = meetings
    .filter((m) => {
      if (statusFilter === "upcoming") return m.status !== "completed" && m.status !== "cancelled";
      if (statusFilter === "completed") return m.status === "completed";
      return true;
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Meetings</h1>
            <p className="text-muted-foreground mt-2">
              Schedule and manage your team meetings
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Button
              variant="outline"
              className="border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
              disabled={instantStarting}
              onClick={handleStartInstantMeeting}
            >
              {instantStarting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Video className="h-4 w-4 mr-2" />
              )}
              Start instant meeting
            </Button>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Schedule meeting
            </Button>
            <ScheduleMeetingDialog
              open={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
            />
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Live now",
              value: liveCount,
              icon: <Video className="h-4 w-4" />,
              cls: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
            },
            {
              label: "Upcoming",
              value: upcomingCount,
              icon: <Clock className="h-4 w-4" />,
              cls: "from-blue-500/15 to-blue-500/5 text-blue-600 dark:text-blue-400 border-blue-500/25",
            },
            {
              label: "Completed",
              value: completedCount,
              icon: <Check className="h-4 w-4" />,
              cls: "from-slate-500/15 to-slate-500/5 text-slate-600 dark:text-slate-300 border-slate-400/25",
            },
            {
              label: "Total",
              value: meetings.length,
              icon: <Calendar className="h-4 w-4" />,
              cls: "from-indigo-500/15 to-indigo-500/5 text-indigo-600 dark:text-indigo-400 border-indigo-500/25",
            },
          ].map((stat) => (
            <button
              key={stat.label}
              type="button"
              onClick={() => navigate("/calendar")}
              className={`flex items-center gap-3 rounded-xl border bg-gradient-to-br ${stat.cls} px-4 py-3 text-left transition-transform hover:scale-[1.015]`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/60 shadow-sm dark:bg-white/10">
                {stat.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-none">{stat.value}</span>
                <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-wide opacity-80 truncate">{stat.label}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex rounded-full border bg-muted/40 p-1">
            {(["all", "upcoming", "completed"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-all ${
                  statusFilter === key
                    ? "bg-white text-foreground shadow-sm dark:bg-slate-800"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {key}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
            onClick={() => navigate("/calendar")}
          >
            <Calendar className="h-4 w-4 mr-1.5" />
            Calendar view
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredMeetings.length === 0 ? (
            <Card className="col-span-full border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600/10 to-violet-600/10">
                  <Video className="h-7 w-7 text-blue-500" />
                </span>
                <div>
                  <p className="font-medium">No meetings here yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {statusFilter === "completed"
                      ? "Completed meetings will appear here"
                      : "Start an instant meeting or schedule one for later"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredMeetings.map((meeting) => {
              const live = isMeetingLive(meeting);
              const isOver = meeting.status === "completed" || meeting.status === "cancelled";
              const accent = live
                ? "from-emerald-500 to-teal-500"
                : meeting.status === "completed"
                  ? "from-slate-400 to-slate-500"
                  : meeting.status === "cancelled"
                    ? "from-red-400 to-red-500"
                    : "from-blue-600 to-violet-600";
              return (
                <Card key={meeting.id} className="group relative overflow-hidden pt-0 transition-shadow hover:shadow-lg">
                  {/* Gradient header band */}
                  <div className={`relative h-20 bg-gradient-to-br ${accent}`}>
                    <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_30%,white_1px,transparent_1px)] [background-size:14px_14px]" />
                    <div className="absolute -bottom-5 left-5">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg dark:bg-slate-900">
                        <Video className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </span>
                    </div>
                    {live && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600 shadow">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        Live
                      </span>
                    )}
                    {!live && !isOver && (
                      <span className="absolute top-3 right-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700 shadow">
                        Upcoming
                      </span>
                    )}
                    {meeting.status === "completed" && (
                      <span className="absolute top-3 right-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow">
                        Completed
                      </span>
                    )}
                    {meeting.status === "cancelled" && (
                      <span className="absolute top-3 right-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-600 shadow">
                        Cancelled
                      </span>
                    )}
                  </div>

                  <CardHeader className="pt-7">
                    <div className="flex items-start gap-2">
                      <CardTitle className="text-lg leading-snug line-clamp-1">{meeting.title}</CardTitle>
                      {(meeting.hasPassword || meeting.password) && (
                        <Lock className="h-4 w-4 mt-1 text-muted-foreground shrink-0" aria-label="Password protected" />
                      )}
                    </div>
                    {meeting.description && (
                      <CardDescription className="mt-1 line-clamp-2">{meeting.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3.5">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDateTime(meeting.startTime).split(", ")[0]}
                      </span>
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDateTime(meeting.startTime).split(", ")[1]}
                        {meeting.endTime ? ` – ${formatDateTime(meeting.endTime).split(", ")[1]}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {meeting.attendees.length + (meeting.guests?.length ?? 0)} participants
                      </div>
                      {meeting.recurrenceRule ? (
                        <Badge variant="outline" className="text-[10px] border-indigo-500/30 bg-indigo-500/5 text-indigo-600 dark:text-indigo-300">
                          <Repeat className="h-3 w-3 mr-1" />
                          Series
                        </Badge>
                      ) : null}
                    </div>

                    {!isOver && (
                      <Button
                        className={`w-full rounded-xl ${live ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25" : "bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"} shadow-lg`}
                        onClick={() => openMeetingRoom(meeting)}
                      >
                        <Video className="h-4 w-4 mr-2" />
                        {live ? "Join now" : "Join Meeting"}
                      </Button>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 rounded-lg"
                        onClick={() => navigate(`/meetings/${meeting.id}`)}
                      >
                        <Info className="h-4 w-4 mr-1.5" />
                        Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 rounded-lg"
                        onClick={() => openEditDialog(meeting)}
                      >
                        <Edit className="h-4 w-4 mr-1.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg text-red-600 hover:bg-red-500/10 hover:text-red-600"
                        onClick={() => {
                          setSelectedMeeting(meeting);
                          setIsDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>Edit Meeting</DialogTitle>
            <DialogDescription>Update meeting details</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
                <div className="grid gap-2">
                  <Label htmlFor="edit-title">Title</Label>
                  <Input
                    id="edit-title"
                    value={editForm.title || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, title: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editForm.description || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-startTime">Start Time</Label>
                    <Input
                      id="edit-startTime"
                      type="datetime-local"
                      value={editForm.startTime || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, startTime: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-endTime">End Time</Label>
                    <Input
                      id="edit-endTime"
                      type="datetime-local"
                      value={editForm.endTime || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, endTime: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-timezone">Timezone</Label>
                  <TimezoneDropdown
                    value={editForm.timezone || ""}
                    onChange={(timezone) =>
                      setEditForm({ ...editForm, timezone })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-password">Password (Optional)</Label>
                  <Input
                    id="edit-password"
                    type="password"
                    value={editForm.password || ""}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        password: e.target.value,
                      })
                    }
                    placeholder="Enter meeting password"
                  />
                </div>
                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="edit-waitingRoomEnabled" className="cursor-pointer">Waiting Room</Label>
                    <Switch
                      id="edit-waitingRoomEnabled"
                      checked={editForm.waitingRoomEnabled ?? false}
                      onCheckedChange={(checked) =>
                        setEditForm({
                          ...editForm,
                          waitingRoomEnabled: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="edit-recordingEnabled" className="cursor-pointer">Recording</Label>
                    <Switch
                      id="edit-recordingEnabled"
                      checked={editForm.recordingEnabled ?? false}
                      onCheckedChange={(checked) =>
                        setEditForm({
                          ...editForm,
                          recordingEnabled: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="edit-screenSharingEnabled" className="cursor-pointer">Screen Sharing</Label>
                    <Switch
                      id="edit-screenSharingEnabled"
                      checked={editForm.screenSharingEnabled ?? false}
                      onCheckedChange={(checked) =>
                        setEditForm({
                          ...editForm,
                          screenSharingEnabled: checked,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Attendees</Label>
                  <TeamMemberMultiSelect
                    selected={editForm.attendeeIds || []}
                    onChange={(ids) => setEditForm({ ...editForm, attendeeIds: ids })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select
                    value={editForm.status || ""}
                    onValueChange={(value) =>
                      setEditForm({
                        ...editForm,
                        status: value as any,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="ongoing">Ongoing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
          <DialogFooter className="shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button onClick={handleEditMeeting} disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Update Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedMeeting && (
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">{selectedMeeting.title}</DialogTitle>
              <DialogDescription>{selectedMeeting.description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Start Time</div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDateTime(selectedMeeting.startTime)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">End Time</div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDateTime(selectedMeeting.endTime)}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Timezone</div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedMeeting.timezone}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Meeting Code</div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-lg font-mono">
                    {selectedMeeting.meetingCode}
                  </Badge>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedMeeting.meetingCode);
                      toast({
                        title: "Copied!",
                        description: "Meeting code copied to clipboard",
                      });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={async () => {
                      const origin = window.location.origin;
                      const link = `${origin}/meetings/${selectedMeeting.meetingCode}`;
                      const lines = [
                        `Join my meeting on Metricorex!`,
                        `Title: ${selectedMeeting.title}`,
                        selectedMeeting.startTime ? `When: ${formatDateTime(selectedMeeting.startTime)}` : null,
                        `Timezone: ${selectedMeeting.timezone || 'Local'}`,
                        `Meeting code: ${selectedMeeting.meetingCode}`,
                        `Link: ${link}`,
                        isCurrentUserHost(selectedMeeting) && (selectedMeeting as any).password
                          ? `Password: ${(selectedMeeting as any).password}`
                          : null,
                        selectedMeeting.waitingRoomEnabled
                          ? 'Note: waiting room is enabled - the host will admit you.'
                          : null,
                        '',
                        'No account needed - open the link and join as a guest.',
                      ].filter(Boolean);
                      try {
                        await navigator.clipboard.writeText(lines.join('\n'));
                        toast({
                          title: "Full invite copied!",
                          description: "All meeting details (code, link, time, password) copied — paste anywhere to share.",
                        });
                      } catch {
                        toast({
                          variant: "destructive",
                          title: "Copy failed",
                          description: "Clipboard access was blocked by the browser.",
                        });
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copy full details
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Status</div>
                <Badge variant="default" className="capitalize">
                  {selectedMeeting.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Max Participants</div>
                  <div>{selectedMeeting.maxParticipants}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Created At</div>
                  <div>{formatDateTime(selectedMeeting.createdAt)}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Features</div>
                <div className="flex flex-wrap gap-2">
                  {selectedMeeting.waitingRoomEnabled && (
                    <Badge variant="outline">Waiting Room</Badge>
                  )}
                  {selectedMeeting.recordingEnabled && (
                    <Badge variant="outline">Recording</Badge>
                  )}
                  {selectedMeeting.screenSharingEnabled && (
                    <Badge variant="outline">Screen Sharing</Badge>
                  )}
                  {selectedMeeting.isInstant && (
                    <Badge variant="outline">Instant Meeting</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Attendees</div>
                <div className="flex flex-wrap gap-2">
                  {(selectedMeeting.attendees ?? []).map((attendee) => {
                    const member = teamMembers.find((m) => m.id === attendee.userId);
                    return (
                      <Badge key={attendee.id} variant="outline">
                        {member?.name || attendee.userId}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setIsDetailDialogOpen(false)}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setIsDetailDialogOpen(false);
                  openMeetingRoom(selectedMeeting);
                }}
              >
                <Video className="h-4 w-4 mr-2" />
                Join Meeting
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDetailDialogOpen(false);
                  openEditDialog(selectedMeeting);
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* The Meeting Room no longer mounts here — it lives in the App root
          (ActiveCallHost) via startCall(), enabling minimize-to-bubble. */}

      {/* ==========================================
          Dialog: Password Entry
          ========================================== */}
      {passwordMeeting && (
        <Dialog
          open={!!passwordMeeting}
          onOpenChange={(open) => !open && setPasswordMeeting(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enter Meeting Password</DialogTitle>
              <DialogDescription>
                This meeting is protected. Enter the password to join.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="join-meeting-password">Password</Label>
              <Input
                id="join-meeting-password"
                type="password"
                value={joinPassword}
                onChange={(event) => {
                  setJoinPassword(event.target.value);
                  setJoinPasswordError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && joinPassword.trim()) {
                    handleJoinMeeting(passwordMeeting, joinPassword);
                  }
                }}
                autoFocus
              />
              {joinPasswordError && (
                <p className="text-sm text-destructive">{joinPasswordError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPasswordMeeting(null)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleJoinMeeting(passwordMeeting, joinPassword)}
                disabled={isProcessing || !joinPassword.trim()}
              >
                {isProcessing && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Join Meeting
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This meeting will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMeeting}
              disabled={isProcessing}
              className="bg-red-600 hover:bg-red-700"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}