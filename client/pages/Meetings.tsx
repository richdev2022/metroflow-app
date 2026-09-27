import { useState, useEffect, useCallback } from "react";
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
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Meeting
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden">
              <DialogHeader className="shrink-0 pr-8">
                <DialogTitle>Schedule New Meeting</DialogTitle>
                <DialogDescription>
                  Create a new meeting and invite team members
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                      value={meetingForm.title}
                    onChange={(e) =>
                      setMeetingForm({ ...meetingForm, title: e.target.value })
                    }
                    placeholder="Enter meeting title"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="startTime">Start Time</Label>
                    <Input
                      id="startTime"
                      type="datetime-local"
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
                    <Label htmlFor="endTime">End Time</Label>
                    <Input
                      id="endTime"
                      type="datetime-local"
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
                  <Label htmlFor="timezone">Timezone</Label>
                  <TimezoneDropdown
                    value={meetingForm.timezone}
                    onChange={(timezone) =>
                      setMeetingForm({
                        ...meetingForm,
                        timezone,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password (Optional)</Label>
                  <Input
                    id="password"
                    type="password"
                    value={meetingForm.password || ""}
                    onChange={(e) =>
                      setMeetingForm({
                        ...meetingForm,
                        password: e.target.value,
                      })
                    }
                    placeholder="Enter meeting password"
                  />
                </div>
                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="waitingRoomEnabled" className="cursor-pointer">Waiting Room</Label>
                    <Switch
                      id="waitingRoomEnabled"
                      checked={meetingForm.waitingRoomEnabled}
                      onCheckedChange={(checked) =>
                        setMeetingForm({
                          ...meetingForm,
                          waitingRoomEnabled: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="recordingEnabled" className="cursor-pointer">Recording</Label>
                    <Switch
                      id="recordingEnabled"
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
                    <Label htmlFor="screenSharingEnabled" className="cursor-pointer">Screen Sharing</Label>
                    <Switch
                      id="screenSharingEnabled"
                      checked={meetingForm.screenSharingEnabled}
                      onCheckedChange={(checked) =>
                        setMeetingForm({
                          ...meetingForm,
                          screenSharingEnabled: checked,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Attendees</Label>
                  <TeamMemberMultiSelect
                    selected={meetingForm.attendeeIds}
                    onChange={(ids) =>
                      setMeetingForm({
                        ...meetingForm,
                        attendeeIds: ids,
                      })
                    }
                  />
                </div>
              </div>
              <DialogFooter className="shrink-0">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button
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
            <Card className="col-span-full">
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">No meetings scheduled</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first meeting to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            meetings.map((meeting) => (
              <Card key={meeting.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-2">
                      <CardTitle className="text-xl">{meeting.title}</CardTitle>
                      {(meeting.hasPassword || meeting.password) && (
                        <Lock className="h-4 w-4 mt-1.5 text-muted-foreground shrink-0" aria-label="Password protected" />
                      )}
                    </div>
                    <Badge variant="outline">
                      {meeting.status}
                    </Badge>
                  </div>
                  {meeting.description && (
                    <CardDescription className="mt-2">
                      {meeting.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {formatDateTime(meeting.startTime)} -{" "}
                    {formatDateTime(meeting.endTime).split(", ")[1]}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {meeting.timezone}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {meeting.attendees.length} attendees
                  </div>
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => openMeetingRoom(meeting)}
                    >
                      <Video className="h-4 w-4 mr-2" />
                      Join Meeting
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openDetailDialog(meeting)}
                    >
                      <Info className="h-4 w-4 mr-2" />
                      Details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
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
                </CardContent>
              </Card>
            ))
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
                inviteDetails={{
                  title: selectedMeeting.title,
                  code: selectedMeeting.meetingCode,
                  password: isCurrentUserHost(selectedMeeting) ? (selectedMeeting as any).password || null : null,
                  waitingRoomEnabled: selectedMeeting.waitingRoomEnabled,
                  startTime: selectedMeeting.startTime,
                }}
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