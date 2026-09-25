import { useState, useEffect, useCallback, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  BellRing,
  Lock,
  Link2,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  useCalls,
  useCreateCall,
  useUpdateCall,
  useJoinCall,
  useLeaveCall,
  useDeleteCall,
  useCall,
} from "@/lib/meetings-chat-calls";
import { Call, CreateCallInput, TeamMember } from "@shared/api";
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
import { useSearchParams, useNavigate } from "react-router-dom";

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
const INDIGO_CTA = "bg-indigo-500 text-white hover:bg-indigo-600";

const FormSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
      {title}
    </p>
    <div className="space-y-4">{children}</div>
  </div>
);

// Call-type icon chip: indigo for video, emerald for audio
const CallTypeIcon = ({ type }: { type: string }) => (
  <div
    className={cn(
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
      type === "video"
        ? "bg-indigo-500/10 text-indigo-600"
        : "bg-emerald-500/10 text-emerald-600"
    )}
  >
    {type === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
  </div>
);

// Status badge: ongoing = emerald pulse, ringing = emerald soft, missed = rose, rest muted
const CallStatusBadge = ({ status }: { status: string }) => {
  if (status === "ongoing" || status === "ringing") {
    return (
      <Badge className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        {status === "ringing" ? "Ringing" : "Ongoing"}
      </Badge>
    );
  }
  if (status === "missed") {
    return (
      <Badge className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50 capitalize">
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="capitalize text-muted-foreground">
      {status}
    </Badge>
  );
};

const isCallActive = (status: string) => status === "ringing" || status === "ongoing";

// ==========================================
// Main Component
// ==========================================
export default function Calls() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

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

  const urlCallId = searchParams.get("callId") || "";
  const urlRoomId = searchParams.get("roomId") || "";
  const urlAutoJoin = searchParams.get("autoJoin") === "1" || searchParams.get("autoJoin") === "true";
  const urlCallType = (searchParams.get("callType") as "audio" | "video") || undefined;
  const urlIsHost = searchParams.get("isHost") === "true" || searchParams.get("isHost") === "1";

  const { data: urlCallData } = useCall(urlCallId);

  // ==========================================
  // Socket
  // ==========================================
  const { socket, isConnected, on, off, inviteToCall } = useSocket({
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

  // Per-call busy state for guest invite link generation
  const [inviteLinkBusyId, setInviteLinkBusyId] = useState<string | null>(null);

  // Create call form
  const [callForm, setCallForm] = useState<CreateCallInput>({ ...INITIAL_CALL_FORM });

  // Track auto-join attempt
  const autoJoinAttemptedRef = useRef(false);

  // ==========================================
  // Computed Values
  // ==========================================
  const calls = (callsData?.calls || []) as Call[];

  // ==========================================
  // Callbacks & Helpers
  // ==========================================
  const isCurrentUserHost = useCallback((call: Call) => {
    const currentUserId = CURRENT_USER_ID();
    return (
      call.hostId === currentUserId ||
      call.createdById === currentUserId ||
      (call as any).coHostId === currentUserId
    );
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
  // Auto-Join from URL params (e.g. navigating from Chat)
  // ==========================================
  useEffect(() => {
    if (!urlAutoJoin || autoJoinAttemptedRef.current) return;

    if (urlCallData) {
      autoJoinAttemptedRef.current = true;
      setSelectedCall(urlCallData as Call);
      setIsJoinDialogOpen(true);
      const curSP = new URLSearchParams(searchParams);
      curSP.delete("autoJoin");
      setSearchParams(curSP, { replace: true });
      return;
    }

    if (urlRoomId) {
      autoJoinAttemptedRef.current = true;
      const syntheticCall = {
        id: urlCallId || urlRoomId,
        callCode: urlRoomId,
        type: urlCallType || "video",
        status: "ongoing",
        hostId: urlIsHost ? CURRENT_USER_ID() : "",
        createdById: CURRENT_USER_ID(),
        waitingRoomEnabled: false,
        recordingEnabled: false,
        isGroupCall: false,
        maxParticipants: 10,
        participants: [],
        name: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as Call;
      setSelectedCall(syntheticCall);
      setIsJoinDialogOpen(true);
      const curSP = new URLSearchParams(searchParams);
      curSP.delete("autoJoin");
      setSearchParams(curSP, { replace: true });
    }
  }, [urlAutoJoin, urlCallData, urlRoomId, urlCallId, urlCallType, urlIsHost, searchParams, setSearchParams, toast]);

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
  // Guest invite link: POST /calls/generate-invite → copy to clipboard
  // ==========================================
  const handleCopyInviteLink = useCallback(async (call: Call) => {
    setInviteLinkBusyId(call.id);
    try {
      const res = await api.post("/calls/generate-invite", {
        roomId: call.callCode || call.id,
        participantName: CURRENT_USER_NAME(),
      });
      const data = unwrapApiData<{ inviteLink?: string }>(
        res.data,
        "Failed to generate invite link"
      );
      const inviteLink = data?.inviteLink;
      if (!inviteLink) throw new Error("Invite link missing from response");
      await navigator.clipboard.writeText(inviteLink);
      sonnerToast.success("Invite link copied", {
        description:
          "Guests can use this link to join the call (valid for 24h)",
      });
    } catch (err) {
      sonnerToast.error("Couldn't copy invite link", {
        description: getApiMessage(err, "Failed to generate invite link"),
      });
    } finally {
      setInviteLinkBusyId(null);
    }
  }, []);

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
  // Participant Status Change Handler (from VideoCallRoom)
  // Keeps parent selectedCall.participants in sync so closing+reopening
  // the room dialog preserves statuses of joined/left/invited users.
  // ==========================================
  const handleParticipantStatusChanged = useCallback(
    (payload: { userId: string; status: "invited" | "joined" | "left" }) => {
      if (!selectedCall) return;
      const { userId, status } = payload;

      setSelectedCall((prev) => {
        if (!prev) return prev;
        const now = new Date().toISOString();
        let changed = false;
        const next = (prev.participants || []).map((p) => {
          if (p.userId !== userId) return p;
          if (p.status === status && status !== "joined") return p;
          changed = true;
          const patch: Partial<typeof p> = { status };
          if (status === "joined") {
            patch.joinedAt = new Date().toISOString();
            patch.leftAt = undefined;
          }
          if (status === "left") {
            patch.leftAt = new Date().toISOString();
          }
          return { ...p, ...patch };
        });
        if (!changed) return prev;
        return { ...prev, participants: next, updatedAt: now };
      });
    },
    [selectedCall]
  );

  // ==========================================
  // Dial-Back helper (for Call Details dialog — dial back invited / left users directly)
  // ==========================================
  const dialBackFromDetailDialog = useCallback(
    async (targetParticipant: {
      userId: string;
      status: "invited" | "joined" | "left";
    }) => {
      if (!selectedCall || !isConnected || !socket) {
        toast({
          variant: "destructive",
          title: "Not connected",
          description: "Cannot invite right now.",
        });
        return;
      }
      if (!isCurrentUserHost(selectedCall)) {
        toast({
          title: "Host only",
          description: "Only the call host can re-send invites.",
        });
        return;
      }
      const memberName =
        teamMembers.find((m) => m.id === targetParticipant.userId)?.name ||
        targetParticipant.userId;
      const verb =
        targetParticipant.status === "invited"
          ? "Re-sending invite"
          : "Calling back";
      toast({
        title: `${verb}...`,
        description: `Ringing ${memberName}...`,
      });
      try {
        inviteToCall(
          selectedCall.id,
          targetParticipant.userId,
          selectedCall.type || "video",
          { callerName: CURRENT_USER_NAME(), roomId: selectedCall.callCode }
        );
      } catch {
        socket.emit("call:invite", {
          callId: selectedCall.id,
          targetUserId: targetParticipant.userId,
          type: selectedCall.type || "video",
          callerName: CURRENT_USER_NAME(),
          roomId: selectedCall.callCode,
        });
      }
      setTimeout(() => {
        toast({
          title:
            targetParticipant.status === "invited"
              ? "Invite re-sent"
              : "Call-back sent",
          description: `${memberName} should see the incoming call ring now.`,
        });
      }, 500);
    },
    [selectedCall, isConnected, socket, inviteToCall, teamMembers, toast]
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
        <PopoverContent className="w-full p-0 border-white/10 bg-[#181926] text-white" align="start">
          <Command className="bg-transparent text-white">
            <CommandInput
              placeholder="Search participants..."
              className="text-white placeholder:text-white/35"
            />
            <CommandList>
              <CommandEmpty className="text-white/50">No team members found.</CommandEmpty>
              <CommandGroup>
                {teamMembers.map((member) => (
                  <CommandItem
                    key={member.id}
                    value={member.name}
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
    const inviteBusy = inviteLinkBusyId === call.id;

    return (
      <Card
        key={call.id}
        className="flex flex-col rounded-2xl border-gray-200/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
      >
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-2">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <CallTypeIcon type={call.type} />
              <div className="min-w-0">
                <CardTitle className="text-lg leading-snug flex items-center gap-1.5">
                  <span className="truncate">
                    {call.type === "video" ? "Video" : "Audio"} Call
                  </span>
                  {(call.hasPassword || call.password) && (
                    <Lock
                      className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                      aria-label="Password protected"
                    />
                  )}
                </CardTitle>
                <CardDescription className="truncate">
                  {participants.length} participant
                  {participants.length !== 1 ? "s" : ""}
                </CardDescription>
              </div>
            </div>
            <CallStatusBadge status={call.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 flex-1 flex flex-col">
          <div className="flex items-center gap-2 rounded-lg bg-muted/70 px-2.5 py-1.5 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
            <span className="truncate">
              {formatDateTime(call.createdAt || new Date().toISOString())}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {participants
                .map((p) => getParticipantName(p.userId))
                .join(", ") || "No participants yet"}
            </span>
          </div>

          <div className="mt-auto space-y-2 pt-2">
            <div className="flex gap-2">
              {active && (
                <Button
                  size="sm"
                  className={cn("flex-1 shadow-md shadow-indigo-500/20", INDIGO_CTA)}
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
              )}

              <Button
                variant="outline"
                size="sm"
                className={cn("shrink-0 border-gray-200/60", !active && "flex-1")}
                title="Copy guest invite link"
                aria-label="Copy guest invite link"
                onClick={() => handleCopyInviteLink(call)}
                disabled={inviteBusy}
              >
                {inviteBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {inviteBusy ? "Copying…" : "Copy Invite"}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-gray-200/60"
                onClick={() => {
                  setSelectedCall(call);
                  setIsDetailDialogOpen(true);
                }}
              >
                View Details
              </Button>

              {active && isJoined && (
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

              {active && isHost && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-gray-200/60"
                  onClick={() => handleEndCall(call)}
                  disabled={isProcessing}
                >
                  End Call
                </Button>
              )}

              <Button
                variant="destructive"
                size="sm"
                onClick={() => setCallToDelete(call)}
                disabled={isProcessing}
                title="Delete call"
                aria-label="Delete call"
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
              <Button className={cn("shadow-lg shadow-indigo-500/20", INDIGO_CTA)}>
                <Plus className="h-4 w-4 mr-2" />
                New Call
              </Button>
            </DialogTrigger>
            <DialogContent
              className={cn(
                "max-w-lg max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden rounded-2xl",
                DARK_DIALOG
              )}
            >
              <DialogHeader className="shrink-0 pr-8">
                <DialogTitle className="text-white">Start New Call</DialogTitle>
                <DialogDescription className="text-white/60">
                  Initiate a video or audio call with team members
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4 pr-1">
                {/* Call Type */}
                <FormSection title="Call Type">
                  <Select
                    value={callForm.type}
                    onValueChange={(value) =>
                      setCallForm({ ...callForm, type: value as "audio" | "video" })
                    }
                  >
                    <SelectTrigger id="call-type" className={DARK_INPUT}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={DARK_SELECT_CONTENT}>
                      <SelectItem className={DARK_SELECT_ITEM} value="video">
                        <div className="flex items-center gap-2">
                          <Video className="h-4 w-4" />
                          Video Call
                        </div>
                      </SelectItem>
                      <SelectItem className={DARK_SELECT_ITEM} value="audio">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Audio Call
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormSection>

                {/* Security */}
                <FormSection title="Security">
                  <div className="grid gap-2">
                    <Label htmlFor="call-password" className="text-white/70">
                      Password (Optional)
                    </Label>
                    <Input
                      id="call-password"
                      type="password"
                      className={DARK_INPUT}
                      value={callForm.password || ""}
                      onChange={(e) =>
                        setCallForm({ ...callForm, password: e.target.value })
                      }
                      placeholder="Enter call password"
                    />
                    <p className="text-xs text-white/45">Guests will need this to join</p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    <div className="space-y-0.5">
                      <Label htmlFor="call-waiting-room" className="cursor-pointer text-white">
                        Waiting Room
                      </Label>
                      <p className="text-xs text-white/45">You'll admit people manually</p>
                    </div>
                    <Switch
                      id="call-waiting-room"
                      className="data-[state=unchecked]:bg-white/20"
                      checked={callForm.waitingRoomEnabled}
                      onCheckedChange={(checked) =>
                        setCallForm({ ...callForm, waitingRoomEnabled: checked })
                      }
                    />
                  </div>
                </FormSection>

                {/* Feature Toggle */}
                <FormSection title="In-call Features">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="call-recording" className="cursor-pointer text-white/80">
                      Recording
                    </Label>
                    <Switch
                      id="call-recording"
                      className="data-[state=unchecked]:bg-white/20"
                      checked={callForm.recordingEnabled}
                      onCheckedChange={(checked) =>
                        setCallForm({ ...callForm, recordingEnabled: checked })
                      }
                    />
                  </div>
                </FormSection>

                {/* Participants */}
                <FormSection title="Participants">
                  <TeamMemberMultiSelect
                    selected={callForm.participantIds}
                    onChange={(ids) =>
                      setCallForm({ ...callForm, participantIds: ids })
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
                  className={INDIGO_CTA}
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
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="rounded-2xl border-gray-200/60">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Skeleton className="h-9 w-9 rounded-xl" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-9 w-full rounded-lg" />
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-9 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 flex-1" />
                    <Skeleton className="h-8 w-9" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : calls.length === 0 ? (
            <Card className="col-span-full rounded-2xl border-gray-200/60 shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10">
                  <Video className="h-8 w-8 text-indigo-500" />
                </div>
                <h3 className="text-lg font-semibold">No calls yet</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Start your first call and invite teammates — or share a guest
                  invite link with anyone.
                </p>
                <Button
                  className={cn("mt-6 shadow-lg shadow-indigo-500/20", INDIGO_CTA)}
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Call
                </Button>
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
          <DialogContent
            className={cn(
              "max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl",
              DARK_DIALOG
            )}
          >
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-2xl text-white">
                {selectedCall.type === "video" ? "Video" : "Audio"} Call Details
              </DialogTitle>
              <DialogDescription className="text-white/60">
                {(selectedCall.participants || []).length} participant
                {(selectedCall.participants || []).length !== 1 ? "s" : ""}
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-4 py-4 pr-4">
                {/* Call Code */}
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                    Call Code
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="text-lg font-mono border-white/10 bg-white/10 text-white"
                    >
                      {selectedCall.callCode}
                    </Badge>
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn("h-9 w-9", DARK_CANCEL)}
                      title="Copy call code"
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
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn("h-9 w-9", DARK_CANCEL)}
                      title="Copy guest invite link"
                      aria-label="Copy guest invite link"
                      onClick={() => handleCopyInviteLink(selectedCall)}
                      disabled={inviteLinkBusyId === selectedCall.id}
                    >
                      {inviteLinkBusyId === selectedCall.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                    Status
                  </div>
                  <CallStatusBadge status={selectedCall.status} />
                </div>

                {/* Type & Participants Count */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                      Type
                    </div>
                    <div className="capitalize text-white">
                      {selectedCall.type === "video"
                        ? "Video Call"
                        : "Audio Call"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                      Participants
                    </div>
                    <div className="text-white">
                      {(selectedCall.participants || []).length}
                    </div>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                    Features
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedCall.waitingRoomEnabled && (
                      <Badge variant="outline" className="border-white/15 bg-white/5 text-white/80">
                        Waiting Room
                      </Badge>
                    )}
                    {selectedCall.recordingEnabled && (
                      <Badge variant="outline" className="border-white/15 bg-white/5 text-white/80">
                        Recording
                      </Badge>
                    )}
                    {selectedCall.isGroupCall && (
                      <Badge variant="outline" className="border-white/15 bg-white/5 text-white/80">
                        Group Call
                      </Badge>
                    )}
                    {selectedCall.password && (
                      <Badge variant="outline" className="border-white/15 bg-white/5 text-white/80">
                        Password Protected
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Participant List */}
                <div className="space-y-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-white/45">
                    Participants
                  </div>
                  {(() => {
                    const ps = selectedCall.participants || [];
                    const joined = ps.filter((p) => p.status === "joined");
                    const invited = ps.filter((p) => p.status === "invited");
                    const left = ps.filter((p) => p.status === "left");
                    const host = isCurrentUserHost(selectedCall);
                    const Section = ({
                      title,
                      count,
                      items,
                      color,
                      showAction,
                    }: {
                      title: string;
                      count: number;
                      items: typeof ps;
                      color?: string;
                      showAction: boolean;
                    }) =>
                      items.length === 0 ? null : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <h4
                              className={
                                "text-[11px] font-semibold uppercase tracking-wider " +
                                (color || "text-white/40")
                              }
                            >
                              {title}
                            </h4>
                            <Badge variant="outline" className="text-[10px] h-5 px-2 border-white/15 text-white/60">
                              {count}
                            </Badge>
                          </div>
                          <div className="space-y-1.5">
                            {items.map((participant) => {
                              const member = teamMembers.find(
                                (m) => m.id === participant.userId
                              );
                              const name = member?.name || participant.userId;
                              const isMe =
                                participant.userId === CURRENT_USER_ID();
                              const isParticipantHost =
                                participant.userId === selectedCall.hostId ||
                                participant.userId === selectedCall.createdById;
                              const statusBadge =
                                participant.status === "joined" ? (
                                  <Badge className="text-[10px] border border-emerald-400/30 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">
                                    In call
                                  </Badge>
                                ) : participant.status === "invited" ? (
                                  <Badge variant="secondary" className="text-[10px] border-white/15 bg-white/10 text-white/80">
                                    Invited
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] border-white/15 text-white/50"
                                  >
                                    Left
                                    {participant.leftAt
                                      ? ` · ${formatDistanceToNow(
                                          new Date(participant.leftAt),
                                          { addSuffix: true }
                                        )}`
                                      : ""}
                                  </Badge>
                                );
                              return (
                                <div
                                  key={participant.id}
                                  className={
                                    "flex items-center justify-between p-2 rounded-md gap-2 transition-colors " +
                                    (participant.status === "left"
                                      ? "opacity-70 hover:opacity-100 hover:bg-white/5"
                                      : "hover:bg-white/5")
                                  }
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <Avatar className="h-8 w-8 shrink-0">
                                      <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-xs">
                                        {name
                                          .split(" ")
                                          .slice(0, 2)
                                          .map((s) => s[0])
                                          .join("")
                                          .toUpperCase()
                                          .slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate text-white">
                                        {name}
                                        {isMe && (
                                          <span className="text-white/45 text-xs ml-1">
                                            (You)
                                          </span>
                                        )}
                                      </p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {isParticipantHost && (
                                          <p className="text-[10px] text-indigo-300">Host</p>
                                        )}
                                        {statusBadge}
                                      </div>
                                    </div>
                                  </div>
                                  {showAction && host && !isMe && isCallActive(selectedCall.status) ? (
                                    <Button
                                      variant={
                                        participant.status === "invited"
                                          ? "outline"
                                          : "secondary"
                                      }
                                      size="sm"
                                      className="h-7 px-2 text-xs gap-1 shrink-0 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                                      onClick={() => dialBackFromDetailDialog(participant)}
                                    >
                                      {participant.status === "invited" ? (
                                        <BellRing className="h-3.5 w-3.5" />
                                      ) : (
                                        <Phone className="h-3.5 w-3.5" />
                                      )}
                                      {participant.status === "invited"
                                        ? "Remind"
                                        : "Dial Back"}
                                    </Button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );

                    return (
                      <div className="space-y-3">
                        {Section({
                          title: "In Call",
                          count: joined.length,
                          items: joined,
                          color: "text-emerald-400",
                          showAction: false,
                        })}
                        {Section({
                          title: "Invited",
                          count: invited.length,
                          items: invited,
                          color: "text-indigo-300",
                          showAction: true,
                        })}
                        {Section({
                          title: "Left",
                          count: left.length,
                          items: left,
                          color: "text-rose-400",
                          showAction: true,
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="shrink-0 gap-2">
              <Button
                variant="outline"
                className={DARK_CANCEL}
                onClick={() => setIsDetailDialogOpen(false)}
              >
                Close
              </Button>
              {isCallActive(selectedCall.status) && (
                <Button
                  className={INDIGO_CTA}
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
            <DialogTitle className="sr-only">{selectedCall.type === "video" ? "Video" : "Audio"} Call Room</DialogTitle>
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
                onParticipantStatusChange={handleParticipantStatusChanged}
                initialParticipants={selectedCall.participants || []}
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
          <DialogContent className={cn("rounded-2xl", DARK_DIALOG)}>
            <DialogHeader>
              <DialogTitle className="text-white">Enter Call Password</DialogTitle>
              <DialogDescription className="text-white/60">
                This call is protected. Enter the password to join.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="join-call-password" className="text-white/70">Password</Label>
              <Input
                id="join-call-password"
                type="password"
                className={DARK_INPUT}
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
                <p className="text-sm text-rose-300">{joinPasswordError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className={DARK_CANCEL}
                onClick={() => setPasswordCall(null)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                className={INDIGO_CTA}
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
                className="bg-rose-600 hover:bg-rose-700"
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