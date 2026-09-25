import { useState, useEffect, useCallback, type ReactNode } from "react";
import Layout from "@/components/layout";
import VideoCallRoom from "@/components/VideoCallRoom";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast as sonnerToast } from "sonner";
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
  Link2,
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
import { Meeting, CreateMeetingInput, UpdateMeetingInput } from "@shared/api";
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

// ==========================================
// Design tokens — premium dark shell, matching the Meet-style call room
// ==========================================
const DARK_DIALOG =
  "border-white/10 bg-gradient-to-br from-[#111221] via-[#141527] to-[#0d0e1a] text-white shadow-2xl";
const DARK_INPUT =
  "border-white/10 bg-white/5 text-white placeholder:text-white/35 focus-visible:border-indigo-500/60 focus-visible:ring-indigo-500/40 [color-scheme:dark]";
const DARK_CANCEL =
  "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white";
const DARK_SELECT_CONTENT = "border-white/10 bg-[#181926] text-white";
const DARK_SELECT_ITEM =
  "focus:bg-indigo-500/25 focus:text-white data-[state=checked]:text-indigo-300";

const FormSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
      {title}
    </p>
    <div className="space-y-4">{children}</div>
  </div>
);

const MeetingStatusBadge = ({ status }: { status: string }) => {
  if (status === "ongoing") {
    return (
      <Badge className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Ongoing
      </Badge>
    );
  }
  if (status === "scheduled") {
    return (
      <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-50">
        Scheduled
      </Badge>
    );
  }
  if (status === "cancelled") {
    return (
      <Badge className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">
        Cancelled
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="capitalize text-muted-foreground">
      {status}
    </Badge>
  );
};

export default function Meetings() {
  const {
    data: meetingsData,
    isLoading: meetingsLoading,
    error: meetingsError,
  } = useMeetings();
  const createMeeting = useCreateMeeting();
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

  const [editForm, setEditForm] = useState<UpdateMeetingInput>({});

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

  const handleCreateMeeting = async () => {
    if (!meetingForm.title || !meetingForm.startTime || !meetingForm.endTime) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all required fields",
      });
      return;
    }
    setIsProcessing(true);
    try {
      await createMeeting.mutateAsync({
        ...meetingForm,
        startTime: toApiDateTime(meetingForm.startTime),
        endTime: toApiDateTime(meetingForm.endTime),
      });
      setIsCreateDialogOpen(false);
      setMeetingForm({
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
      toast({
        title: "Meeting created",
        description: "Your meeting has been scheduled successfully",
      });
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
        setIsMeetingRoomOpen(true);
        setPasswordMeeting(null);
        setJoinPassword("");
        setJoinPasswordError("");

        toast({
          title: "Joined Meeting",
          description: "You have joined the meeting",
        });
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
      setIsMeetingRoomOpen(true);
    },
    [handleJoinMeeting]
  );

  const handleLeaveMeeting = useCallback(
    async (meeting: Meeting) => {
      setIsProcessing(true);
      try {
        const updatedMeeting = await leaveMeeting.mutateAsync(meeting.id);
        setSelectedMeeting(updatedMeeting);
        setIsMeetingRoomOpen(false);
        toast({
          title: "Left Meeting",
          description: "You have left the meeting",
        });
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
    [leaveMeeting, toast]
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

  const copyGuestLink = (meeting: Meeting) => {
    const link = `${window.location.origin}/meetings/${meeting.meetingCode}`;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        sonnerToast.success("Guest link copied", {
          description: "Anyone with this link can ask to join this meeting",
        });
      })
      .catch(() => {
        sonnerToast.error("Couldn't copy link", { description: link });
      });
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
            className="w-full justify-between min-h-[40px] h-auto border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          >
            <div className="flex flex-wrap gap-1">
              {selected.length === 0 ? (
                <span className="text-white/40">{placeholder}</span>
              ) : (
                selected.map((id) => {
                  const member = teamMembers.find((d) => d.id === id);
                  return (
                    <Badge
                      key={id}
                      variant="secondary"
                      className="border-white/15 bg-white/10 text-white text-xs"
                    >
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
        <PopoverContent className="w-full p-0 border-white/10 bg-[#181926] text-white">
          <Command className="bg-transparent text-white">
            <CommandInput
              placeholder="Search attendees..."
              className="text-white placeholder:text-white/35"
            />
            <CommandList>
              <CommandEmpty className="text-white/50">
                No team members found.
              </CommandEmpty>
              <CommandGroup>
                {teamMembers.map((member) => (
                  <CommandItem
                    key={member.id}
                    className="text-white data-[selected=true]:bg-indigo-500/25 data-[selected=true]:text-white focus:bg-indigo-500/25 focus:text-white"
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
        <div className="space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-10 w-36" />
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="rounded-2xl border-gray-200/60">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-9 w-full rounded-lg" />
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-9 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 flex-1" />
                    <Skeleton className="h-8 flex-1" />
                    <Skeleton className="h-8 flex-1" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  // FIX: Normalize null attendees to [] so .length and .map() never throw
  const meetings = (meetingsData?.meetings || []).map((m: Meeting) => ({
    ...m,
    attendees: m.attendees ?? [],
  }));

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
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/20">
                <Plus className="h-4 w-4 mr-2" />
                New Meeting
              </Button>
            </DialogTrigger>
            <DialogContent
              className={cn(
                "max-w-lg max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden rounded-2xl",
                DARK_DIALOG
              )}
            >
              <DialogHeader className="shrink-0 pr-8">
                <DialogTitle className="text-white">Schedule New Meeting</DialogTitle>
                <DialogDescription className="text-white/60">
                  Create a new meeting and invite team members
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4 pr-1">
                <FormSection title="Details">
                  <div className="grid gap-2">
                    <Label htmlFor="title" className="text-white/70">Title</Label>
                    <Input
                      id="title"
                      className={DARK_INPUT}
                      value={meetingForm.title}
                      onChange={(e) =>
                        setMeetingForm({ ...meetingForm, title: e.target.value })
                      }
                      placeholder="Enter meeting title"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description" className="text-white/70">Description</Label>
                    <Textarea
                      id="description"
                      className={DARK_INPUT}
                      value={meetingForm.description}
                      onChange={(e) =>
                        setMeetingForm({
                          ...meetingForm,
                          description: e.target.value,
                        })
                      }
                      placeholder="Enter meeting description"
                    />
                  </div>
                </FormSection>
                <FormSection title="Schedule">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="startTime" className="text-white/70">Start Time</Label>
                      <Input
                        id="startTime"
                        type="datetime-local"
                        className={DARK_INPUT}
                        value={meetingForm.startTime}
                        onChange={(e) =>
                          setMeetingForm({
                            ...meetingForm,
                            startTime: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="endTime" className="text-white/70">End Time</Label>
                      <Input
                        id="endTime"
                        type="datetime-local"
                        className={DARK_INPUT}
                        value={meetingForm.endTime}
                        onChange={(e) =>
                          setMeetingForm({
                            ...meetingForm,
                            endTime: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="timezone" className="text-white/70">Timezone</Label>
                    <TimezoneDropdown
                      value={meetingForm.timezone}
                      triggerClassName="border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                      contentClassName="border-white/10 bg-[#181926] text-white"
                      onChange={(timezone) =>
                        setMeetingForm({
                          ...meetingForm,
                          timezone,
                        })
                      }
                    />
                  </div>
                </FormSection>
                <FormSection title="Security">
                  <div className="grid gap-2">
                    <Label htmlFor="password" className="text-white/70">Password (Optional)</Label>
                    <Input
                      id="password"
                      type="password"
                      className={DARK_INPUT}
                      value={meetingForm.password || ""}
                      onChange={(e) =>
                        setMeetingForm({
                          ...meetingForm,
                          password: e.target.value,
                        })
                      }
                      placeholder="Enter meeting password"
                    />
                    <p className="text-xs text-white/45">
                      Guests will need this to join
                    </p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    <div className="space-y-0.5">
                      <Label htmlFor="waitingRoomEnabled" className="cursor-pointer text-white">
                        Waiting Room
                      </Label>
                      <p className="text-xs text-white/45">You'll admit people manually</p>
                    </div>
                    <Switch
                      id="waitingRoomEnabled"
                      className="data-[state=unchecked]:bg-white/20"
                      checked={meetingForm.waitingRoomEnabled}
                      onCheckedChange={(checked) =>
                        setMeetingForm({
                          ...meetingForm,
                          waitingRoomEnabled: checked,
                        })
                      }
                    />
                  </div>
                </FormSection>
                <FormSection title="In-call Features">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="recordingEnabled" className="cursor-pointer text-white/80">Recording</Label>
                    <Switch
                      id="recordingEnabled"
                      className="data-[state=unchecked]:bg-white/20"
                      checked={meetingForm.recordingEnabled}
                      onCheckedChange={(checked) =>
                        setMeetingForm({
                          ...meetingForm,
                          recordingEnabled: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="screenSharingEnabled" className="cursor-pointer text-white/80">Screen Sharing</Label>
                    <Switch
                      id="screenSharingEnabled"
                      className="data-[state=unchecked]:bg-white/20"
                      checked={meetingForm.screenSharingEnabled}
                      onCheckedChange={(checked) =>
                        setMeetingForm({
                          ...meetingForm,
                          screenSharingEnabled: checked,
                        })
                      }
                    />
                  </div>
                </FormSection>
                <FormSection title="Attendees">
                  <TeamMemberMultiSelect
                    selected={meetingForm.attendeeIds}
                    onChange={(ids) =>
                      setMeetingForm({
                        ...meetingForm,
                        attendeeIds: ids,
                      })
                    }
                  />
                </FormSection>
              </div>
              <DialogFooter className="shrink-0">
                <Button
                  variant="outline"
                  className={DARK_CANCEL}
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-indigo-500 text-white hover:bg-indigo-600"
                  onClick={handleCreateMeeting}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Schedule Meeting
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {meetings.length === 0 ? (
            <Card className="col-span-full rounded-2xl border-gray-200/60 shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10">
                  <Video className="h-8 w-8 text-indigo-500" />
                </div>
                <h3 className="text-lg font-semibold">No meetings scheduled</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Create your first meeting and share the guest link with your
                  team to get started.
                </p>
                <Button
                  className="mt-6 bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/20"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Meeting
                </Button>
              </CardContent>
            </Card>
          ) : (
            meetings.map((meeting) => {
              const isHost = isCurrentUserHost(meeting);
              const isYou = isCurrentUserAttendee(meeting);
              return (
                <Card
                  key={meeting.id}
                  className="group flex flex-col rounded-2xl border-gray-200/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600">
                          <Video className="h-4 w-4" />
                        </div>
                        <CardTitle className="text-lg leading-snug break-words">
                          {meeting.title}
                        </CardTitle>
                        {(meeting.hasPassword || meeting.password) && (
                          <Lock
                            className="h-4 w-4 mt-1.5 text-muted-foreground shrink-0"
                            aria-label="Password protected"
                          />
                        )}
                      </div>
                      <MeetingStatusBadge status={meeting.status} />
                    </div>
                    {meeting.description && (
                      <CardDescription className="mt-2 line-clamp-2">
                        {meeting.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 rounded-lg bg-muted/70 px-2.5 py-1.5 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                      <span className="truncate">
                        {formatDateTime(meeting.startTime)}
                        {meeting.endTime
                          ? ` – ${
                              formatDateTime(meeting.endTime).split(", ")[1] ||
                              formatDateTime(meeting.endTime)
                            }`
                          : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span className="truncate">{meeting.timezone}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {meeting.attendees.length} attendee
                          {meeting.attendees.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isHost && (
                          <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-50">
                            Host
                          </Badge>
                        )}
                        {isYou && !isHost && (
                          <Badge variant="secondary">You</Badge>
                        )}
                        {meeting.isInstant && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Instant
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto space-y-2 pt-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-indigo-500 text-white hover:bg-indigo-600 shadow-md shadow-indigo-500/20"
                          onClick={() => openMeetingRoom(meeting)}
                        >
                          <Video className="h-4 w-4 mr-2" />
                          Join Meeting
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-gray-200/60"
                          title="Copy guest link"
                          aria-label="Copy guest link"
                          onClick={() => copyGuestLink(meeting)}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-gray-200/60"
                          onClick={() => openDetailDialog(meeting)}
                        >
                          <Info className="h-4 w-4 mr-2" />
                          Details
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-gray-200/60"
                          onClick={() => openEditDialog(meeting)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setSelectedMeeting(meeting);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent
          className={cn(
            "max-w-lg max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden rounded-2xl",
            DARK_DIALOG
          )}
        >
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle className="text-white">Edit Meeting</DialogTitle>
            <DialogDescription className="text-white/60">
              Update meeting details
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4 pr-1">
            <FormSection title="Details">
              <div className="grid gap-2">
                <Label htmlFor="edit-title" className="text-white/70">Title</Label>
                <Input
                  id="edit-title"
                  className={DARK_INPUT}
                  value={editForm.title || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, title: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-description" className="text-white/70">Description</Label>
                <Textarea
                  id="edit-description"
                  className={DARK_INPUT}
                  value={editForm.description || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                />
              </div>
            </FormSection>
            <FormSection title="Schedule">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-startTime" className="text-white/70">Start Time</Label>
                  <Input
                    id="edit-startTime"
                    type="datetime-local"
                    className={DARK_INPUT}
                    value={editForm.startTime || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, startTime: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-endTime" className="text-white/70">End Time</Label>
                  <Input
                    id="edit-endTime"
                    type="datetime-local"
                    className={DARK_INPUT}
                    value={editForm.endTime || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, endTime: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-timezone" className="text-white/70">Timezone</Label>
                <TimezoneDropdown
                  value={editForm.timezone || ""}
                  triggerClassName="border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  contentClassName="border-white/10 bg-[#181926] text-white"
                  onChange={(timezone) =>
                    setEditForm({ ...editForm, timezone })
                  }
                />
              </div>
            </FormSection>
            <FormSection title="Security">
              <div className="grid gap-2">
                <Label htmlFor="edit-password" className="text-white/70">Password (Optional)</Label>
                <Input
                  id="edit-password"
                  type="password"
                  className={DARK_INPUT}
                  value={editForm.password || ""}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      password: e.target.value,
                    })
                  }
                  placeholder="Enter meeting password"
                />
                <p className="text-xs text-white/45">Guests will need this to join</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-waitingRoomEnabled" className="cursor-pointer text-white">Waiting Room</Label>
                  <p className="text-xs text-white/45">You'll admit people manually</p>
                </div>
                <Switch
                  id="edit-waitingRoomEnabled"
                  className="data-[state=unchecked]:bg-white/20"
                  checked={editForm.waitingRoomEnabled ?? false}
                  onCheckedChange={(checked) =>
                    setEditForm({
                      ...editForm,
                      waitingRoomEnabled: checked,
                    })
                  }
                />
              </div>
            </FormSection>
            <FormSection title="In-call Features">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-recordingEnabled" className="cursor-pointer text-white/80">Recording</Label>
                <Switch
                  id="edit-recordingEnabled"
                  className="data-[state=unchecked]:bg-white/20"
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
                <Label htmlFor="edit-screenSharingEnabled" className="cursor-pointer text-white/80">Screen Sharing</Label>
                <Switch
                  id="edit-screenSharingEnabled"
                  className="data-[state=unchecked]:bg-white/20"
                  checked={editForm.screenSharingEnabled ?? false}
                  onCheckedChange={(checked) =>
                    setEditForm({
                      ...editForm,
                      screenSharingEnabled: checked,
                    })
                  }
                />
              </div>
            </FormSection>
            <FormSection title="Attendees">
              <TeamMemberMultiSelect
                selected={editForm.attendeeIds || []}
                onChange={(ids) => setEditForm({ ...editForm, attendeeIds: ids })}
              />
            </FormSection>
            <FormSection title="Status">
              <Select
                value={editForm.status || ""}
                onValueChange={(value) =>
                  setEditForm({
                    ...editForm,
                    status: value as any,
                  })
                }
              >
                <SelectTrigger id="edit-status" className={DARK_INPUT}>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className={DARK_SELECT_CONTENT}>
                  <SelectItem className={DARK_SELECT_ITEM} value="scheduled">Scheduled</SelectItem>
                  <SelectItem className={DARK_SELECT_ITEM} value="ongoing">Ongoing</SelectItem>
                  <SelectItem className={DARK_SELECT_ITEM} value="completed">Completed</SelectItem>
                  <SelectItem className={DARK_SELECT_ITEM} value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </FormSection>
          </div>
          <DialogFooter className="shrink-0">
            <Button
              variant="outline"
              className={DARK_CANCEL}
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              className="bg-indigo-500 text-white hover:bg-indigo-600"
              onClick={handleEditMeeting}
              disabled={isProcessing}
            >
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
          <DialogContent
            className={cn(
              "max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl",
              DARK_DIALOG
            )}
          >
            <DialogHeader>
              <DialogTitle className="text-2xl text-white">{selectedMeeting.title}</DialogTitle>
              <DialogDescription className="text-white/60">
                {selectedMeeting.description}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-white/45">Start Time</div>
                  <div className="flex items-center gap-2 text-white">
                    <Calendar className="h-4 w-4 text-indigo-300" />
                    <span>{formatDateTime(selectedMeeting.startTime)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-white/45">End Time</div>
                  <div className="flex items-center gap-2 text-white">
                    <Clock className="h-4 w-4 text-indigo-300" />
                    <span>{formatDateTime(selectedMeeting.endTime)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-white/45">Timezone</div>
                <div className="flex items-center gap-2 text-white">
                  <Clock className="h-4 w-4 text-indigo-300" />
                  <span>{selectedMeeting.timezone}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-white/45">Meeting Code</div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-lg font-mono border-white/10 bg-white/10 text-white">
                    {selectedMeeting.meetingCode}
                  </Badge>
                  <Button
                    variant="outline"
                    size="icon"
                    className={DARK_CANCEL}
                    title="Copy meeting code"
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
                  <Button
                    variant="outline"
                    size="icon"
                    className={DARK_CANCEL}
                    title="Copy guest link"
                    aria-label="Copy guest link"
                    onClick={() => copyGuestLink(selectedMeeting)}
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-white/45">Status</div>
                <MeetingStatusBadge status={selectedMeeting.status} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-white/45">Max Participants</div>
                  <div className="text-white">{selectedMeeting.maxParticipants}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-white/45">Created At</div>
                  <div className="text-white">{formatDateTime(selectedMeeting.createdAt)}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-white/45">Features</div>
                <div className="flex flex-wrap gap-2">
                  {selectedMeeting.waitingRoomEnabled && (
                    <Badge variant="outline" className="border-white/15 bg-white/5 text-white/80">Waiting Room</Badge>
                  )}
                  {selectedMeeting.recordingEnabled && (
                    <Badge variant="outline" className="border-white/15 bg-white/5 text-white/80">Recording</Badge>
                  )}
                  {selectedMeeting.screenSharingEnabled && (
                    <Badge variant="outline" className="border-white/15 bg-white/5 text-white/80">Screen Sharing</Badge>
                  )}
                  {selectedMeeting.isInstant && (
                    <Badge variant="outline" className="border-indigo-400/30 bg-indigo-500/15 text-indigo-300">Instant Meeting</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-white/45">Attendees</div>
                <div className="flex flex-wrap gap-2">
                  {(selectedMeeting.attendees ?? []).map((attendee) => {
                    const member = teamMembers.find((m) => m.id === attendee.userId);
                    return (
                      <Badge key={attendee.id} variant="outline" className="border-white/15 bg-white/5 text-white/80">
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
                className={DARK_CANCEL}
                onClick={() => setIsDetailDialogOpen(false)}
              >
                Close
              </Button>
              <Button
                className="bg-indigo-500 text-white hover:bg-indigo-600"
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
                className={DARK_CANCEL}
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

      {selectedMeeting && (
        <Dialog
          open={isMeetingRoomOpen}
          onOpenChange={(open) => {
            if (!open && selectedMeeting) {
              handleLeaveMeeting(selectedMeeting);
              return;
            }
            setIsMeetingRoomOpen(open);
          }}
        >
          <DialogContent className="max-w-screen max-h-screen w-screen h-screen p-0 m-0 rounded-none overflow-hidden border-0">
            <DialogTitle className="sr-only">Meeting Room: {selectedMeeting.title}</DialogTitle>
            <div className="min-h-0 flex-1 h-full">
              <VideoCallRoom
                roomId={selectedMeeting.meetingCode}
                meetingId={selectedMeeting.id}
                onLeave={() => handleLeaveMeeting(selectedMeeting)}
                userName={localStorage.getItem("userName") || "User"}
                isHost={isCurrentUserHost(selectedMeeting)}
                waitingRoomEnabled={selectedMeeting.waitingRoomEnabled}
                teamMembers={teamMembers}
                currentParticipantIds={(
                  selectedMeeting.attendees ?? []
                ).map((attendee) => attendee.userId)}
                initialParticipants={transformAttendeesToInitialParticipants(
                  selectedMeeting
                )}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ==========================================
          Dialog: Password Entry
          ========================================== */}
      {passwordMeeting && (
        <Dialog
          open={!!passwordMeeting}
          onOpenChange={(open) => !open && setPasswordMeeting(null)}
        >
          <DialogContent className={cn("rounded-2xl", DARK_DIALOG)}>
            <DialogHeader>
              <DialogTitle className="text-white">Enter Meeting Password</DialogTitle>
              <DialogDescription className="text-white/60">
                This meeting is protected. Enter the password to join.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="join-meeting-password" className="text-white/70">Password</Label>
              <Input
                id="join-meeting-password"
                type="password"
                className={DARK_INPUT}
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
                <p className="text-sm text-rose-300">{joinPasswordError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className={DARK_CANCEL}
                onClick={() => setPasswordMeeting(null)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                className="bg-indigo-500 text-white hover:bg-indigo-600"
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
              className="bg-rose-600 hover:bg-rose-700"
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