import { useState, useEffect, useCallback, useRef } from "react";
import Layout from "@/components/layout";
import VideoCallRoom from "@/components/VideoCallRoom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  Phone,
  Video,
  Plus,
  Calendar,
  Users,
  Loader2,
  X,
  Check,
  Trash2,
  Copy,
  PhoneOff,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  useCalls,
  useCreateCall,
  useUpdateCall,
  useJoinCall,
  useLeaveCall,
  useDeleteCall,
} from "@/lib/meetings-chat-calls";
import { AudioUtils } from "@/lib/audio-utils";
import { Call, CreateCallInput, UpdateCallInput, TeamMember } from "@shared/api";
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
import { useSocket } from "@/hooks/useSocket";
import { ScrollArea } from "@/components/ui/scroll-area";

// ==========================================
// Constants
// ==========================================
const CURRENT_USER_ID = () => localStorage.getItem("userId") || "";
const CURRENT_USER_NAME = () => localStorage.getItem("userName") || "User";

const INITIAL_CALL_FORM: CreateCallInput = {
  type: "video",
  isGroupCall: false,
  maxParticipants: 10,
  waitingRoomEnabled: false,
  recordingEnabled: false,
  participantIds: [],
};

// ==========================================
// Status Helpers
// ==========================================
const getStatusVariant = (status: string) => {
  switch (status) {
    case "ongoing":
      return "default" as const;
    case "ringing":
      return "secondary" as const;
    case "completed":
      return "outline" as const;
    case "missed":
      return "destructive" as const;
    case "cancelled":
      return "outline" as const;
    default:
      return "outline" as const;
  }
};

const isCallActive = (status: string) => status === "ringing" || status === "ongoing";

// ==========================================
// Main Component
// ==========================================
export default function Calls() {
  // ==========================================
  // Query Hooks
  // ==========================================
  const {
    data: callsData,
    isLoading: callsLoading,
    error: callsError,
  } = useCalls();
  const createCall = useCreateCall();
  const updateCall = useUpdateCall();
  const joinCall = useJoinCall();
  const leaveCall = useLeaveCall();
  const deleteCall = useDeleteCall();
  const { toast } = useToast();

  // ==========================================
  // Socket
  // ==========================================
  const { socket, isConnected, on, off } = useSocket({
    userId: CURRENT_USER_ID(),
    businessId: localStorage.getItem("businessId") || "",
  });

  // ==========================================
  // State
  // ==========================================
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Dialog visibility
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Selected/active call
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [callToDelete, setCallToDelete] = useState<Call | null>(null);

  // Password flow
  const [passwordCall, setPasswordCall] = useState<Call | null>(null);
  const [joinPassword, setJoinPassword] = useState("");
  const [joinPasswordError, setJoinPasswordError] = useState("");

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);

  // Create call form
  const [callForm, setCallForm] = useState<CreateCallInput>({ ...INITIAL_CALL_FORM });

  // Incoming call
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const ringtoneRef = useRef<(() => void) | null>(null);

  // ==========================================
  // Computed Values
  // ==========================================
  const calls = (callsData?.calls || []) as Call[];

  // ==========================================
  // Callbacks & Helpers
  // ==========================================
  const isCurrentUserHost = useCallback((call: Call) => {
    const currentUserId = CURRENT_USER_ID();
    return call.hostId === currentUserId || call.createdById === currentUserId;
  }, []);

  const isCurrentUserJoined = useCallback((call: Call) => {
    const currentUserId = CURRENT_USER_ID();
    return call.participants?.some(
      (participant) => participant.userId === currentUserId && participant.status === "joined"
    ) ?? false;
  }, []);

  const getParticipantName = useCallback(
    (userId?: string) => {
      if (!userId) return "Unknown";
      return teamMembers.find((m) => m.id === userId)?.name || userId;
    },
    [teamMembers]
  );

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const stopRingtone = useCallback(() => {
    if (ringtoneRef.current) {
      ringtoneRef.current();
      ringtoneRef.current = null;
    }
  }, []);

  // ==========================================
  // Data Fetching
  // ==========================================
  const fetchTeamMembers = useCallback(async () => {
    try {
      const res = await api.get("/team");
      setTeamMembers(unwrapApiData<TeamMember[]>(res.data, "Failed to fetch team members"));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to fetch team members"),
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  // ==========================================
  // Error Handling
  // ==========================================
  useEffect(() => {
    if (callsError) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(callsError, "Failed to load calls"),
      });
    }
  }, [callsError, toast]);

  // ==========================================
  // Incoming Call Handling
  // ==========================================
  const handleIncomingCall = useCallback((callData: any) => {
    setIncomingCall(callData);
    AudioUtils.playRingtone().then((stopFn) => {
      ringtoneRef.current = stopFn;
    });
  }, []);

  const handleAcceptIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    stopRingtone();

    try {
      const call = await api.get(`/api/calls/${incomingCall.callId}`);
      const parsedCall = unwrapApiData<Call>(call.data, "Failed to get call");
      setSelectedCall(parsedCall);
      setIncomingCall(null);

      // If already joined, open room directly; otherwise prompt join
      if (isCurrentUserJoined(parsedCall) || isCurrentUserHost(parsedCall)) {
        setIsJoinDialogOpen(true);
      } else {
        handleJoinCall(parsedCall);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to accept incoming call"),
      });
    }
  }, [incomingCall, stopRingtone, isCurrentUserJoined, isCurrentUserHost, toast]);

  const handleRejectIncomingCall = useCallback(() => {
    stopRingtone();
    setIncomingCall(null);
  }, [stopRingtone]);

  useEffect(() => {
    if (!isConnected || !socket) return;

    on("call:incoming", handleIncomingCall);

    return () => {
      off("call:incoming", handleIncomingCall);
      stopRingtone();
    };
  }, [isConnected, socket, on, off, handleIncomingCall, stopRingtone]);

  // ==========================================
  // Call Actions
  // ==========================================
  const resetCallForm = useCallback(() => {
    setCallForm({ ...INITIAL_CALL_FORM });
  }, []);

  const handleCreateCall = useCallback(async () => {
    if (callForm.participantIds.length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select at least one participant",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const createdCall = await createCall.mutateAsync(callForm);
      setIsCreateDialogOpen(false);
      resetCallForm();
      toast({
        title: "Call Created",
        description: "Your call has been initiated successfully",
      });

      // Open the call room immediately after creation
      setSelectedCall(createdCall);
      setIsJoinDialogOpen(true);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to create call"),
      });
    } finally {
      setIsProcessing(false);
    }
  }, [callForm, createCall, resetCallForm, toast]);

  const promptForCallPassword = useCallback((call: Call, message = "") => {
    setPasswordCall(call);
    setJoinPassword("");
    setJoinPasswordError(message);
  }, []);

  const handleJoinCall = useCallback(
    async (call: Call, password?: string) => {
      // Check if password is required
      if (call.password && !isCurrentUserHost(call) && !password) {
        promptForCallPassword(call);
        return;
      }

      setIsProcessing(true);
      try {
        const joinedCall = await joinCall.mutateAsync({
          callId: call.id,
          password,
        });

        setSelectedCall(joinedCall);
        setIsJoinDialogOpen(true);
        setPasswordCall(null);
        setJoinPassword("");
        setJoinPasswordError("");

        toast({
          title: "Joined Call",
          description: "You have joined the call",
        });
      } catch (err) {
        const code = (err as any)?.response?.data?.code;
        if (code === "PASSWORD_REQUIRED" || code === "INVALID_PASSWORD") {
          promptForCallPassword(
            call,
            code === "INVALID_PASSWORD" ? "Invalid password. Please try again." : ""
          );
          return;
        }

        toast({
          variant: "destructive",
          title: "Error",
          description: getApiMessage(err, "Failed to join call"),
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [joinCall, isCurrentUserHost, promptForCallPassword, toast]
  );

  const handleOpenCallRoom = useCallback(
    (call: Call) => {
      if (!isCurrentUserHost(call) && !isCurrentUserJoined(call)) {
        handleJoinCall(call);
        return;
      }
      setSelectedCall(call);
      setIsJoinDialogOpen(true);
    },
    [isCurrentUserHost, isCurrentUserJoined, handleJoinCall]
  );

  const handleLeaveCall = useCallback(
    async (call: Call) => {
      setIsProcessing(true);
      try {
        const updatedCall = await leaveCall.mutateAsync(call.id);
        setSelectedCall(updatedCall);
        setIsJoinDialogOpen(false);
        toast({
          title: "Left Call",
          description: "You have left the call",
        });
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Error",
          description: getApiMessage(err, "Failed to leave call"),
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [leaveCall, toast]
  );

  const handleEndCall = useCallback(
    async (call: Call) => {
      setIsProcessing(true);
      try {
        const updatedCall = await updateCall.mutateAsync({
          callId: call.id,
          data: { status: "completed" },
        });
        setSelectedCall(updatedCall);
        setIsJoinDialogOpen(false);
        toast({
          title: "Call Ended",
          description: "The call has been completed",
        });
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Error",
          description: getApiMessage(err, "Failed to end call"),
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [updateCall, toast]
  );

  const handleDeleteCallConfirm = useCallback(async () => {
    if (!callToDelete) return;
    setIsProcessing(true);
    try {
      await deleteCall.mutateAsync(callToDelete.id);
      toast({
        title: "Call Deleted",
        description: "The call has been deleted successfully",
      });
      setCallToDelete(null);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to delete call"),
      });
    } finally {
      setIsProcessing(false);
    }
  }, [callToDelete, deleteCall, toast]);

  // ==========================================
  // Participant Added Handler (from VideoCallRoom)
  // ==========================================
  const handleParticipantsAdded = useCallback(
    (participantIds: string[]) => {
      if (!selectedCall) return;

      setSelectedCall((prev) => {
        if (!prev) return prev;

        const existingIds = new Set(
          (prev.participants || []).map((p) => p.userId)
        );
        const now = new Date().toISOString();

        return {
          ...prev,
          updatedAt: now,
          participants: [
            ...(prev.participants || []),
            ...participantIds
              .filter((userId) => !existingIds.has(userId))
              .map((userId) => ({
                id: `pending_${userId}_${Date.now()}`,
                userId,
                status: "invited" as const,
              })),
          ],
        };
      });
    },
    [selectedCall]
  );

  // ==========================================
  // Team Member Multi-Select Component
  // ==========================================
  const TeamMemberMultiSelect = ({
    selected,
    onChange,
    placeholder = "Select participants...",
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
            className="w-full justify-between min-h-[40px] h-auto"
          >
            <div className="flex flex-wrap gap-1">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                selected.map((id) => {
                  const member = teamMembers.find((d) => d.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="text-xs">
                      {member?.name || id}
                      <button
                        type="button"
                        aria-label={`Remove ${member?.name || "participant"}`}
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
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Search participants..." />
            <CommandList>
              <CommandEmpty>No team members found.</CommandEmpty>
              <CommandGroup>
                {teamMembers.map((member) => (
                  <CommandItem
                    key={member.id}
                    value={member.name}
                    onSelect={() => {
                      const newSelected = selected.includes(member.id)
                        ? selected.filter((s) => s !== member.id)
                        : [...selected, member.id];
                      onChange(newSelected);
                    }}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${
                        selected.includes(member.id)
                          ? "opacity-100"
                          : "opacity-0"
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

  // ==========================================
  // Render: Call Card
  // ==========================================
  const renderCallCard = (call: Call) => {
    const isHost = isCurrentUserHost(call);
    const isJoined = isCurrentUserJoined(call);
    const active = isCallActive(call.status);
    const participants = call.participants || [];

    return (
      <Card key={call.id} className="flex flex-col">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xl flex items-center gap-2">
                {call.type === "video" ? (
                  <Video className="h-5 w-5 shrink-0" />
                ) : (
                  <Phone className="h-5 w-5 shrink-0" />
                )}
                <span className="truncate">
                  {call.type === "video" ? "Video" : "Audio"} Call
                </span>
              </CardTitle>
              <CardDescription>
                {participants.length} participant{participants.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <Badge variant={getStatusVariant(call.status)} className="shrink-0">
              {call.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 flex-1 flex flex-col">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="truncate">{formatDateTime(call.createdAt || new Date().toISOString())}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {participants
                .map((p) => getParticipantName(p.userId))
                .join(", ")}
            </span>
          </div>

          <div className="mt-auto space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setSelectedCall(call);
                setIsDetailDialogOpen(true);
              }}
            >
              View Details
            </Button>

            <div className="flex gap-2">
              {active && (
                <>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleOpenCallRoom(call)}
                    disabled={isProcessing}
                  >
                    {call.type === "video" ? (
                      <Video className="h-4 w-4 mr-2" />
                    ) : (
                      <Phone className="h-4 w-4 mr-2" />
                    )}
                    {isJoined || isHost ? "Open Room" : "Join"}
                  </Button>

                  {isJoined && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleLeaveCall(call)}
                      disabled={isProcessing}
                    >
                      <Phone className="h-4 w-4 mr-2 rotate-135" />
                      Leave
                    </Button>
                  )}

                  {isHost && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEndCall(call)}
                      disabled={isProcessing}
                    >
                      End Call
                    </Button>
                  )}
                </>
              )}

              <Button
                variant="destructive"
                size="sm"
                onClick={() => setCallToDelete(call)}
                disabled={isProcessing}
                title="Delete call"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ==========================================
  // Render
  // ==========================================
  return (
    <Layout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Calls</h1>
            <p className="text-muted-foreground mt-2">
              Manage your video and audio calls
            </p>
          </div>

          {/* Create Call Dialog Trigger */}
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Call
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden">
              <DialogHeader className="shrink-0 pr-8">
                <DialogTitle>Start New Call</DialogTitle>
                <DialogDescription>
                  Initiate a video or audio call with team members
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
                {/* Call Type */}
                <div className="grid gap-2">
                  <Label htmlFor="call-type">Call Type</Label>
                  <Select
                    value={callForm.type}
                    onValueChange={(value) =>
                      setCallForm({ ...callForm, type: value as "audio" | "video" })
                    }
                  >
                    <SelectTrigger id="call-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">
                        <div className="flex items-center gap-2">
                          <Video className="h-4 w-4" />
                          Video Call
                        </div>
                      </SelectItem>
                      <SelectItem value="audio">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Audio Call
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Password */}
                <div className="grid gap-2">
                  <Label htmlFor="call-password">Password (Optional)</Label>
                  <Input
                    id="call-password"
                    type="password"
                    value={callForm.password || ""}
                    onChange={(e) =>
                      setCallForm({ ...callForm, password: e.target.value })
                    }
                    placeholder="Enter call password"
                  />
                </div>

                {/* Feature Toggles */}
                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="call-waiting-room"
                      className="cursor-pointer"
                    >
                      Waiting Room
                    </Label>
                    <Switch
                      id="call-waiting-room"
                      checked={callForm.waitingRoomEnabled}
                      onCheckedChange={(checked) =>
                        setCallForm({ ...callForm, waitingRoomEnabled: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="call-recording"
                      className="cursor-pointer"
                    >
                      Recording
                    </Label>
                    <Switch
                      id="call-recording"
                      checked={callForm.recordingEnabled}
                      onCheckedChange={(checked) =>
                        setCallForm({ ...callForm, recordingEnabled: checked })
                      }
                    />
                  </div>
                </div>

                {/* Participants */}
                <div className="grid gap-2">
                  <Label>Participants</Label>
                  <TeamMemberMultiSelect
                    selected={callForm.participantIds}
                    onChange={(ids) =>
                      setCallForm({ ...callForm, participantIds: ids })
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
                  onClick={handleCreateCall}
                  disabled={isProcessing || callForm.participantIds.length === 0}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : callForm.type === "video" ? (
                    <Video className="h-4 w-4 mr-2" />
                  ) : (
                    <Phone className="h-4 w-4 mr-2" />
                  )}
                  Start Call
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Calls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {callsLoading ? (
            <Card className="col-span-full">
              <CardContent className="pt-6 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
              </CardContent>
            </Card>
          ) : calls.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="pt-6 text-center py-12">
                <Video className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground text-lg">No calls yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Start your first call to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            calls.map(renderCallCard)
          )}
        </div>
      </div>

      {/* ==========================================
          Dialog: Call Details
          ========================================== */}
      {selectedCall && (
        <Dialog
          open={isDetailDialogOpen}
          onOpenChange={setIsDetailDialogOpen}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-2xl">
                {selectedCall.type === "video" ? "Video" : "Audio"} Call Details
              </DialogTitle>
              <DialogDescription>
                {(selectedCall.participants || []).length} participant
                {(selectedCall.participants || []).length !== 1 ? "s" : ""}
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-4 py-4 pr-4">
                {/* Call Code */}
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Call Code</div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="text-lg font-mono"
                    >
                      {selectedCall.callCode}
                    </Badge>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedCall.callCode);
                        toast({
                          title: "Copied!",
                          description: "Call code copied to clipboard",
                        });
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Status</div>
                  <Badge variant="default" className="capitalize">
                    {selectedCall.status}
                  </Badge>
                </div>

                {/* Type & Participants Count */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Type</div>
                    <div className="capitalize">
                      {selectedCall.type === "video"
                        ? "Video Call"
                        : "Audio Call"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      Participants
                    </div>
                    <div>{(selectedCall.participants || []).length}</div>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Features</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedCall.waitingRoomEnabled && (
                      <Badge variant="outline">Waiting Room</Badge>
                    )}
                    {selectedCall.recordingEnabled && (
                      <Badge variant="outline">Recording</Badge>
                    )}
                    {selectedCall.isGroupCall && (
                      <Badge variant="outline">Group Call</Badge>
                    )}
                    {selectedCall.password && (
                      <Badge variant="outline">Password Protected</Badge>
                    )}
                  </div>
                </div>

                {/* Participant List */}
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Participants
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(selectedCall.participants || []).map((participant) => {
                      const member = teamMembers.find(
                        (m) => m.id === participant.userId
                      );
                      return (
                        <div
                          key={participant.id}
                          className="flex items-center gap-1.5"
                        >
                          <Badge variant="outline">
                            {member?.name || participant.userId}
                          </Badge>
                          <Badge
                            variant={
                              participant.status === "joined"
                                ? "default"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {participant.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="shrink-0 gap-2">
              <Button
                variant="outline"
                onClick={() => setIsDetailDialogOpen(false)}
              >
                Close
              </Button>
              {isCallActive(selectedCall.status) && (
                <Button
                  onClick={() => {
                    setIsDetailDialogOpen(false);
                    handleOpenCallRoom(selectedCall);
                  }}
                >
                  {selectedCall.type === "video" ? (
                    <Video className="h-4 w-4 mr-2" />
                  ) : (
                    <Phone className="h-4 w-4 mr-2" />
                  )}
                  {isCurrentUserJoined(selectedCall) || isCurrentUserHost(selectedCall)
                    ? "Open Room"
                    : "Join Call"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ==========================================
          Dialog: Call Room (VideoCallRoom)
          ========================================== */}
      {selectedCall && selectedCall.callCode && (
        <Dialog
          open={isJoinDialogOpen}
          onOpenChange={(open) => {
            if (!open && selectedCall) {
              // When dialog closes, leave the call
              handleLeaveCall(selectedCall);
              return;
            }
            setIsJoinDialogOpen(open);
          }}
        >
          <DialogContent className="max-w-screen max-h-screen w-screen h-screen p-0 m-0 rounded-none overflow-hidden border-0">
            <div className="min-h-0 flex-1 h-full">
              <VideoCallRoom
                roomId={selectedCall.callCode}
                callId={selectedCall.id}
                callType={selectedCall.type}
                onLeave={() => handleLeaveCall(selectedCall)}
                userName={CURRENT_USER_NAME()}
                isHost={isCurrentUserHost(selectedCall)}
                waitingRoomEnabled={selectedCall.waitingRoomEnabled}
                teamMembers={teamMembers}
                currentParticipantIds={(
                  selectedCall.participants || []
                ).map((participant) => participant.userId)}
                onParticipantsAdded={handleParticipantsAdded}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ==========================================
          Dialog: Password Entry
          ========================================== */}
      {passwordCall && (
        <Dialog
          open={!!passwordCall}
          onOpenChange={(open) => !open && setPasswordCall(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enter Call Password</DialogTitle>
              <DialogDescription>
                This call is protected. Enter the password to join.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="join-call-password">Password</Label>
              <Input
                id="join-call-password"
                type="password"
                value={joinPassword}
                onChange={(event) => {
                  setJoinPassword(event.target.value);
                  setJoinPasswordError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && joinPassword.trim()) {
                    handleJoinCall(passwordCall, joinPassword);
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
                onClick={() => setPasswordCall(null)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleJoinCall(passwordCall, joinPassword)}
                disabled={isProcessing || !joinPassword.trim()}
              >
                {isProcessing && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Join Call
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ==========================================
          Dialog: Incoming Call
          ========================================== */}
      {incomingCall && (
        <Dialog
          open={!!incomingCall}
          onOpenChange={(open) => !open && handleRejectIncomingCall()}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="text-center">
              <DialogTitle className="text-2xl">
                Incoming{" "}
                {incomingCall.type === "video" ? "Video" : "Audio"} Call
              </DialogTitle>
              <DialogDescription className="text-lg">
                {teamMembers.find((m) => m.id === incomingCall.from)?.name ||
                  "Someone"}{" "}
                is calling...
              </DialogDescription>
            </DialogHeader>

            <div className="flex justify-center my-8">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center animate-pulse">
                {incomingCall.type === "video" ? (
                  <Video className="w-12 h-12 text-white" />
                ) : (
                  <Phone className="w-12 h-12 text-white" />
                )}
              </div>
            </div>

            <DialogFooter className="flex gap-4 justify-center sm:justify-center">
              <Button
                variant="destructive"
                size="lg"
                className="w-16 h-16 rounded-full flex items-center justify-center"
                onClick={handleRejectIncomingCall}
              >
                <PhoneOff className="w-8 h-8" />
              </Button>
              <Button
                size="lg"
                className="w-16 h-16 rounded-full flex items-center justify-center bg-green-600 hover:bg-green-700"
                onClick={handleAcceptIncomingCall}
              >
                {incomingCall.type === "video" ? (
                  <Video className="w-8 h-8" />
                ) : (
                  <Phone className="w-8 h-8" />
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ==========================================
          Alert: Delete Confirmation
          ========================================== */}
      {callToDelete && (
        <AlertDialog
          open={!!callToDelete}
          onOpenChange={(open) => !open && setCallToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Call</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this call? This action cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isProcessing}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteCallConfirm}
                disabled={isProcessing}
                className="bg-red-600 hover:bg-red-700"
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Layout>
  );
}