import { useState, useEffect } from "react";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  useCalls,
  useCreateCall,
  useUpdateCall,
  useJoinCall,
  useLeaveCall,
} from "@/lib/meetings-chat-calls";
import { Call, CreateCallInput, UpdateCallInput } from "@shared/api";
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

export default function Calls() {
  const { data: callsData, isLoading: callsLoading, error: callsError } = useCalls();
  const createCall = useCreateCall();
  const updateCall = useUpdateCall();
  const joinCall = useJoinCall();
  const leaveCall = useLeaveCall();
  const { toast } = useToast();

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [callForm, setCallForm] = useState<CreateCallInput>({
    type: "video",
    participant_ids: [],
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
    if (callForm.participant_ids.length === 0) {
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
        participant_ids: [],
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

  const handleJoinCall = async (call: Call) => {
    setIsProcessing(true);
    try {
      const joinedCall = await joinCall.mutateAsync(call.id);
      setSelectedCall(joinedCall);
      setIsJoinDialogOpen(true);
      toast({
        title: "Joined call",
        description: "You have joined the call",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to join call"),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenCallRoom = (call: Call) => {
    setSelectedCall(call);
    setIsJoinDialogOpen(true);
  };

  const handleLeaveCall = async (call: Call) => {
    setIsProcessing(true);
    try {
      await leaveCall.mutateAsync(call.id);
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
      await updateCall.mutateAsync({
        callId: call.id,
        data: { status: "completed" },
      });
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

  const getParticipantName = (userId: string) => {
    return teamMembers.find((m) => m.id === userId)?.name || userId;
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

  const calls = callsData?.calls || [];

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
                  <Label>Participants</Label>
                  <TeamMemberMultiSelect
                    selected={callForm.participant_ids}
                    onChange={(ids) =>
                      setCallForm({ ...callForm, participant_ids: ids })
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
                    {formatDateTime(call.created_at)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {call.participants
                      .map((p) => getParticipantName(p.user_id))
                      .join(", ")}
                  </div>
                  {call.jitsi_room_id && (
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleOpenCallRoom(call)}
                      >
                        {call.type === "video" ? (
                          <Video className="h-4 w-4 mr-2" />
                        ) : (
                          <Phone className="h-4 w-4 mr-2" />
                        )}
                        Open Call Room
                      </Button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {call.status === "ringing" || call.status === "ongoing" ? (
                      <>
                        {!call.participants.find(
                          (p) =>
                            p.user_id === localStorage.getItem("userId") &&
                            p.status === "joined"
                        ) ? (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => handleJoinCall(call)}
                            disabled={isProcessing}
                          >
                            {call.type === "video" ? (
                              <Video className="h-4 w-4 mr-2" />
                            ) : (
                              <Phone className="h-4 w-4 mr-2" />
                            )}
                            Join Call
                          </Button>
                        ) : (
                          <>
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
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleEndCall(call)}
                              disabled={isProcessing}
                            >
                              End Call
                            </Button>
                          </>
                        )}
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {selectedCall && selectedCall.jitsi_room_id && (
        <Dialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}>
          <DialogContent className="max-w-4xl h-[80vh]">
            <DialogHeader>
              <DialogTitle>{selectedCall.type === "video" ? "Video" : "Audio"} Call</DialogTitle>
              <DialogDescription>
                {selectedCall.participants.length} participants
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 w-full h-full">
              <iframe
                title="Jitsi Meet Call"
                src={`https://meet.jit.si/${selectedCall.jitsi_room_id}#userInfo.displayName="${
                  localStorage.getItem("userName") || "User"
                }"`}
                className="w-full h-full min-h-[400px] rounded-lg border border-border"
                allow="camera; microphone; fullscreen; display-capture; autoplay"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Layout>
  );
}
