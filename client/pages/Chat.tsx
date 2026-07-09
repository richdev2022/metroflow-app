import { useState, useEffect, useRef } from "react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Plus, MessageSquare, Users, Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  useConversations,
  useCreateConversation,
  useMessages,
  useSendMessage,
} from "@/lib/meetings-chat-calls";
import { Conversation, CreateConversationInput } from "@shared/api";
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
import { Check } from "lucide-react";

type ChatParticipant = Conversation["participants"][number] & {
  userId?: string;
};

type ChatMessage = {
  id: string;
  conversation_id?: string;
  conversationId?: string;
  sender_id?: string;
  senderId?: string;
  content?: string;
  created_at?: string;
  createdAt?: string;
  sender_name?: string;
  senderName?: string;
};

export default function Chat() {
  const {
    data: conversations,
    isLoading: conversationsLoading,
    error: conversationsError,
  } = useConversations();
  const createConversation = useCreateConversation();
  const sendMessage = useSendMessage();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [conversationForm, setConversationForm] = useState<CreateConversationInput>({
    name: "",
    type: "direct",
    participantIds: [],
  });

  const { data: messagesData } = useMessages(selectedConversation?.id || "", 1, 100);

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    if (conversationsError) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(conversationsError, "Failed to get conversations"),
      });
    }
  }, [conversationsError, toast]);

  useEffect(() => {
    scrollToBottom();
  }, [messagesData]);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCreateConversation = async () => {
    if (conversationForm.participantIds.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select at least one participant",
      });
      return;
    }
    setIsProcessing(true);
    try {
      const conversation = await createConversation.mutateAsync(conversationForm);
      setIsCreateDialogOpen(false);
      setConversationForm({
        name: "",
        type: "direct",
        participantIds: [],
      });
      setSelectedConversation(conversation);
      toast({
        title: "Conversation created",
        description: "Your conversation has been created successfully",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to create conversation"),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !newMessage.trim()) return;
    try {
      await sendMessage.mutateAsync({
        conversationId: selectedConversation.id,
        data: { content: newMessage },
      });
      setNewMessage("");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to send message"),
      });
    }
  };

  const getParticipantUserId = (participant?: ChatParticipant) => {
    return participant?.userId || "";
  };

  const getCurrentUserId = () => {
    return localStorage.getItem("userId") || "";
  };

  const getParticipantName = (userId?: string) => {
    if (!userId) return "Unknown";
    return teamMembers.find((m) => m.id === userId)?.name || userId;
  };

  const getConversationName = (conversation: Conversation) => {
    if (conversation.name?.trim()) return conversation.name;
    if (conversation.type === "direct") {
      const userId = getCurrentUserId();
      const otherParticipant = conversation.participants.find(
        (p) => getParticipantUserId(p as ChatParticipant) !== userId
      );
      const participantId = getParticipantUserId(otherParticipant as ChatParticipant);
      return otherParticipant
        ? getParticipantName(participantId)
        : "Direct Message";
    }
    return "Group Chat";
  };

  const getConversationInitials = (conversation: Conversation) => {
    const name = getConversationName(conversation) || "Chat";
    return name.substring(0, 2).toUpperCase();
  };

  const getMessageSenderId = (message: ChatMessage) => {
    return message.senderId || "";
  };

  const getMessageSenderName = (message: ChatMessage) => {
    return message.senderName || getParticipantName(getMessageSenderId(message));
  };

  const getMessageCreatedAt = (message: ChatMessage) => {
    return message.createdAt || new Date().toISOString();
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const messages = (messagesData?.messages || []) as ChatMessage[];

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

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-120px)] sm:h-[calc(100vh-80px)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Chat</h1>
            <p className="text-muted-foreground mt-2">
              Communicate with your team
            </p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Conversation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Conversation</DialogTitle>
                <DialogDescription>
                  Start a new chat with team members
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={conversationForm.type}
                    onValueChange={(value) =>
                      setConversationForm({
                        ...conversationForm,
                        type: value as any,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">Direct Message</SelectItem>
                      <SelectItem value="group">Group Chat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {conversationForm.type === "group" && (
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={conversationForm.name}
                      onChange={(e) =>
                        setConversationForm({
                          ...conversationForm,
                          name: e.target.value,
                        })
                      }
                      placeholder="Enter group name"
                    />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Participants</Label>
                  <TeamMemberMultiSelect
                    selected={conversationForm.participantIds}
                    onChange={(ids) =>
                      setConversationForm({
                        ...conversationForm,
                        participantIds: ids,
                      })
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
                <Button
                  onClick={handleCreateConversation}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-1 overflow-hidden bg-background rounded-lg border border-border">
          {/* Conversation List */}
          <div className="w-full sm:w-80 border-r border-border flex flex-col">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold text-lg">Conversations</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversationsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : conversations && conversations.length > 0 ? (
                <div className="divide-y divide-border">
                  {conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      onClick={() => setSelectedConversation(conversation)}
                      className={`w-full p-4 text-left hover:bg-muted transition-colors ${
                        selectedConversation?.id === conversation.id
                          ? "bg-muted"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {getConversationInitials(conversation)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline">
                            <p className="font-medium truncate">
                              {getConversationName(conversation)}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {conversation.type}
                            </Badge>
                          </div>
                          {conversation.lastMessage && (
                            <p className="text-sm text-muted-foreground truncate">
                              {conversation.lastMessage}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No conversations yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Start a new conversation to get started
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {selectedConversation ? (
              <>
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {getConversationInitials(selectedConversation)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold">
                        {getConversationName(selectedConversation)}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedConversation.participants.length} participants
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No messages yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Send the first message to start the conversation
                      </p>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const isOwn =
                        getMessageSenderId(message) === getCurrentUserId();
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] sm:max-w-[60%] ${
                              isOwn
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            } rounded-2xl px-4 py-2`}
                          >
                            {!isOwn && (
                              <p className="text-xs font-medium mb-1 opacity-70">
                                {getMessageSenderName(message)}
                              </p>
                            )}
                            <p>{message.content || ""}</p>
                            <p className="text-xs opacity-70 mt-1 text-right">
                              {formatTime(getMessageCreatedAt(message))}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-4 border-t border-border">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type your message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="flex-1"
                    />
                    <Button onClick={handleSendMessage}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center">
                <Users className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Select a conversation</h3>
                <p className="text-muted-foreground mt-1">
                  Choose an existing conversation or create a new one
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
