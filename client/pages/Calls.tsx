import { useState, useEffect } from "react";
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

export default function Calls() {
  const { data: callsData, isLoading: callsLoading, error: callsError } = useCalls();
  const createCall = useCreateCall();
  const updateCall = useUpdateCall();
  const joinCall = useJoinCall();
  const leaveCall = useLeaveCall();
  const deleteCall = useDeleteCall();
  const { toast } = useToast();

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [passwordCall, setPasswordCall] = useState<Call | null>(null);
  const [joinPassword, setJoinPassword] = useState("");
  const [joinPasswordError, setJoinPasswordError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [callForm, setCallForm] = useState<CreateCallInput>({
    type: "video",
    isGroupCall: false,
    maxParticipants: 10,
    waitingRoomEnabled: false,
    recordingEnabled: false,
    participantIds: [],
  });

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    if (callsError) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(callsError, "Failed to get calls"),
      });
    }
  }, [callsError, toast]);

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

  const handleCreateCall = async () => {
    if (callForm.participantIds.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select at least one participant",
      });
      return;
    }
    setIsProcessing(true);
    try {
      const call = await createCall.mutateAsync(callForm);
      setIsCreateDialogOpen(false);
      setCallForm({
        type: "video",
        isGroupCall: false,
        maxParticipants: 10,
        waitingRoomEnabled: false,
        recordingEnabled: false,
        participantIds: [],
      });
      toast({
        title: "Call created",
        description: "Your call has been initiated",
      });
      setSelectedCall(call);
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
  };

  const isCurrentUserHost = (call: Call) => {
    const currentUserId = getCurrentUserId();
    return call.hostId === currentUserId || call.createdById === currentUserId;
  };

  const isCurrentUserJoined = (call: Call) => {
    const currentUserId = getCurrentUserId();
    return call.participants.some(
      (participant) => participant.userId === currentUserId && participant.status === "joined",
    );
  };

  const promptForCallPassword = (call: Call, message = "") => {
    setPasswordCall(call);
    setJoinPassword("");
    setJoinPasswordError(message);
  };

  const handleJoinCall = async (call: Call, password?: string) => {
    if (call.password && !isCurrentUserHost(call) && !password) {
      promptForCallPassword(call);
      return;
    }

    setIsProcessing(true);
    try {
      const joinedCall = await joinCall.mutateAsync({ callId: call.id, password });
      setSelectedCall(joinedCall);
      setIsJoinDialogOpen(true);
      setPasswordCall(null);
      setJoinPassword("");
      setJoinPasswordError("");
      toast({
        title: "Joined call",
        description: "You have joined the call",
      });
    } catch (err) {
      const code = (err as any)?.response?.data?.code;
      if (code === "PASSWORD_REQUIRED" || code === "INVALID_PASSWORD") {
        promptForCallPassword(
          call,
          code === "INVALID_PASSWORD" ? "Invalid password. Please try again." : "",
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
  };

  const openDetailDialog = (call: Call) => {
    setSelectedCall(call);
    setIsDetailDialogOpen(true);
  };

  const handleOpenCallRoom = (call: Call) => {
    if (!isCurrentUserHost(call) && !isCurrentUserJoined(call)) {
      handleJoinCall(call);
      return;
    }

    setSelectedCall(call);
    setIsJoinDialogOpen(true);
  };

  const handleLeaveCall = async (call: Call) => {
    setIsProcessing(true);
    try {
      const updatedCall = await leaveCall.mutateAsync(call.id);
      setSelectedCall(updatedCall);
      setIsJoinDialogOpen(false);
      toast({
        title: "Left call",
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
  };

  const handleEndCall = async (call: Call) => {
    setIsProcessing(true);
    try {
      const updatedCall = await updateCall.mutateAsync({
        callId: call.id,
        data: { status: "completed" },
      });
      setSelectedCall(updatedCall);
      setIsJoinDialogOpen(false);
      toast({
        title: "Call ended",
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
  };

  const handleDeleteCall = async (call: Call) => {
    setIsProcessing(true);
    try {
      await deleteCall.mutateAsync(call.id);
      toast({
        title: "Call deleted",
        description: "The call has been deleted",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to delete call"),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleParticipantsAdded = (participantIds: string[]) => {
    if (!selectedCall) return;

    const existingIds = new Set(selectedCall.participants.map(participant => participant.userId));
    const now = new Date().toISOString();
    setSelectedCall({
      ...selectedCall,
      updatedAt: now,
      participants: [
        ...selectedCall.participants,
        ...participantIds
          .filter(userId => !existingIds.has(userId))
          .map(userId => ({
            id: `pending_${userId}`,
            userId,
            status: 'invited' as const,
          })),
      ],
    });
  };

  const getCurrentUserId = () => {
    return localStorage.getItem("userId") || "";
  };

  const getParticipantUserId = (participant: Call['participants'][number]) => {
    return participant.userId || "";
  };

  const getParticipantName = (userId?: string) => {
    if (!userId) return "Unknown";
    return teamMembers.find((m) => m.id === userId)?.name || userId;
  };

  const getCallRoomId = (call: Call) => {
    return call.callCode || "";
  };

  const getCallCreatedAt = (call: Call) => {
    return call.createdAt || new Date().toISOString();
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ongoing":
        return "default";
      case "ringing":
        return "secondary";
      case "completed":
        return "outline";
      case "missed":
        return "destructive";
      case "cancelled":
        return "outline";
      default:
        return "outline";
    }
  };

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
                        aria-label={`Remove ${member?.name || 'participant'}`}
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
            <CommandInput placeholder="Search participants..." />
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

  const calls = (callsData?.calls || []) as Call[];

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Calls</h1>
            <p className="text-muted-foreground mt-2">
              Manage your video and audio calls
            </p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Call
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start New Call</DialogTitle>
                <DialogDescription>
                  Initiate a video or audio call with team members
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="type">Call Type</Label>
                  <Select
                    value={callForm.type}
                    onValueChange={(value) =>
                      setCallForm({ ...callForm, type: value as any })
                    }
                  >
                    <SelectTrigger>
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
                <div className="grid gap-2">
                  <Label htmlFor="password">Password (Optional)</Label>
                  <Input
                    id="password"
                    type="password"
                    value={callForm.password || ""}
                    onChange={(e) =>
                      setCallForm({
                        ...callForm,
                        password: e.target.value,
                      })
                    }
                    placeholder="Enter call password"
                  />
                </div>
                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="waitingRoomEnabled" className="cursor-pointer">Waiting Room</Label>
                    <Switch
                      id="waitingRoomEnabled"
                      checked={callForm.waitingRoomEnabled}
                      onCheckedChange={(checked) =>
                        setCallForm({
                          ...callForm,
                          waitingRoomEnabled: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="recordingEnabled" className="cursor-pointer">Recording</Label>
                    <Switch
                      id="recordingEnabled"
                      checked={callForm.recordingEnabled}
                      onCheckedChange={(checked) =>
                        setCallForm({
                          ...callForm,
                          recordingEnabled: checked,
                        })
                      }
                    />
                  </div>
                </div>
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
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateCall} disabled={isProcessing}>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {callsLoading ? (
            <Card className="col-span-full">
              <CardContent className="pt-6 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
              </CardContent>
            </Card>
          ) : calls.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="pt-6 text-center">
                <Video className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No calls yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Start your first call to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            calls.map((call) => (
              <Card key={call.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        {call.type === "video" ? (
                          <Video className="h-5 w-5" />
                        ) : (
                          <Phone className="h-5 w-5" />
                        )}
                        {call.type === "video" ? "Video" : "Audio"} Call
                      </CardTitle>
                      <CardDescription>
                        {call.participants.length} participants
                      </CardDescription>
                    </div>
                    <Badge variant={getStatusColor(call.status)}>
                      {call.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {formatDateTime(getCallCreatedAt(call))}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {call.participants
                      .map((p) => getParticipantName(getParticipantUserId(p)))
                      .join(", ")}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => openDetailDialog(call)}
                  >
                    View Details
                  </Button>
                  <div className="flex gap-2">
                    {call.status === "ringing" || call.status === "ongoing" ? (
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
                          {isCurrentUserJoined(call) || isCurrentUserHost(call) ? "Open Call Room" : "Join Call"}
                        </Button>
                        {isCurrentUserJoined(call) ? (
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
                        ) : null}
                        {isCurrentUserHost(call) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleEndCall(call)}
                            disabled={isProcessing}
                          >
                            End Call
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {selectedCall && (
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">
                {selectedCall.type === "video" ? "Video" : "Audio"} Call Details
              </DialogTitle>
              <DialogDescription>
                {selectedCall.participants.length} participants
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Call Code</div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-lg font-mono">
                    {selectedCall.callCode}
                  </Badge>
                  <Button
                    variant="outline"
                    size="icon"
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

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Status</div>
                <Badge variant="default" className="capitalize">
                  {selectedCall.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Type</div>
                  <div className="capitalize">
                    {selectedCall.type === "video" ? "Video Call" : "Audio Call"}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Participants</div>
                  <div>{selectedCall.participants.length}</div>
                </div>
              </div>

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
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Participants</div>
                <div className="flex flex-wrap gap-2">
                  {selectedCall.participants.map((participant) => {
                    const member = teamMembers.find((m) => m.id === participant.userId);
                    return (
                      <Badge key={participant.id} variant="outline">
                        {member?.name || participant.userId}
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
              {selectedCall.status === "ringing" || selectedCall.status === "ongoing" ? (
                <Button onClick={() => {
                  setIsDetailDialogOpen(false);
                  handleOpenCallRoom(selectedCall);
                }}>
                  {selectedCall.type === "video" ? (
                    <Video className="h-4 w-4 mr-2" />
                  ) : (
                    <Phone className="h-4 w-4 mr-2" />
                  )}
                  {isCurrentUserJoined(selectedCall) || isCurrentUserHost(selectedCall) ? "Open Call Room" : "Join Call"}
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {selectedCall && selectedCall.callCode && (
        <Dialog
          open={isJoinDialogOpen}
          onOpenChange={(open) => {
            if (!open && selectedCall) {
              handleLeaveCall(selectedCall);
              return;
            }
            setIsJoinDialogOpen(open);
          }}
        >
          <DialogContent className="max-w-7xl h-[90vh] flex flex-col overflow-hidden p-0">
            <DialogHeader className="p-4 shrink-0">
              <DialogTitle>{selectedCall.type === "video" ? "Video" : "Audio"} Call</DialogTitle>
              <DialogDescription>Call Room</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1">
              <VideoCallRoom
                roomId={selectedCall.callCode}
                callId={selectedCall.id}
                callType={selectedCall.type}
                onLeave={() => handleLeaveCall(selectedCall)}
                userName={localStorage.getItem("userName") || "User"}
                isHost={isCurrentUserHost(selectedCall)}
                waitingRoomEnabled={selectedCall.waitingRoomEnabled}
                teamMembers={teamMembers}
                currentParticipantIds={selectedCall.participants.map(participant => participant.userId)}
                onParticipantsAdded={handleParticipantsAdded}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {passwordCall && (
        <Dialog open={!!passwordCall} onOpenChange={(open) => !open && setPasswordCall(null)}>
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
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Join Call
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Layout>
  );
}
