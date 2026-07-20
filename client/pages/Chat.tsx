import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Plus,
  MessageSquare,
  Users,
  Loader2,
  X,
  Check,
  Search,
  ArrowLeft,
  Smile,
  MoreVertical,
  CircleDot,
  Menu,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  useConversations,
  useCreateConversation,
  useMessages,
  useSendMessage,
} from "@/lib/meetings-chat-calls";
import { Conversation, CreateConversationInput, TeamMember } from "@shared/api";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSocket } from "@/hooks/useSocket";
import { AudioUtils } from "@/lib/audio-utils";
import { cn } from "@/lib/utils";

// ==========================================
// Types & Interfaces
// ==========================================
type ChatParticipant = Conversation["participants"][number] & {
  userId?: string;
  user_id?: string;
  name?: string;
  userName?: string;
  user_name?: string;
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
  attachment_url?: string;
  attachmentUrl?: string;
  attachment_type?: string;
  attachmentType?: string;
  status?: "sending" | "sent" | "failed";
  isOptimistic?: boolean;
};

type ConversationView = Conversation & {
  lastMessage?: string;
  last_message?: string;
  lastmessage?: string;
  lastMessageAt?: string;
  last_message_at?: string;
  lastmessageat?: string;
  unreadCount?: number;
};

// ==========================================
// Constants & Helpers
// ==========================================
const CURRENT_USER_ID = () => localStorage.getItem("userId") || "";
const CURRENT_USER_NAME = () => localStorage.getItem("userName") || "You";

const getParticipantUserId = (p?: ChatParticipant) => p?.userId || p?.user_id || "";

const getParticipantName = (
  members: TeamMember[],
  userId?: string,
  participant?: ChatParticipant
) => {
  const pName = participant?.userName || participant?.user_name || participant?.name;
  if (pName?.trim()) return pName;
  if (!userId) return "Unknown";
  if (userId === CURRENT_USER_ID()) return CURRENT_USER_NAME();
  return members.find((m) => m.id === userId)?.name || userId;
};

const getDirectParticipant = (conv: ConversationView) => {
  const uid = CURRENT_USER_ID();
  return (
    (conv.participants as ChatParticipant[]).find((p) => getParticipantUserId(p) !== uid) ||
    (conv.participants as ChatParticipant[])[0]
  );
};

const getConversationName = (members: TeamMember[], conv: ConversationView) => {
  if (conv.name?.trim()) return conv.name;
  if (conv.type === "direct") {
    const p = getDirectParticipant(conv);
    return getParticipantName(members, getParticipantUserId(p), p);
  }
  return "Group Chat";
};

const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

const getMsgSenderId = (m: ChatMessage) => m.senderId || m.sender_id || "";

const getMsgSenderName = (members: TeamMember[], m: ChatMessage) =>
  m.senderName || m.sender_name || getParticipantName(members, getMsgSenderId(m));

const getMsgTime = (m: ChatMessage) => m.createdAt || m.created_at || new Date().toISOString();

const getLastMsg = (c: ConversationView) => c.lastMessage || c.last_message || c.lastmessage || "";

const getLastMsgTime = (c: ConversationView) =>
  c.lastMessageAt || c.last_message_at || c.lastmessageat || "";

// Helpers for rendering received attachments from others
const getAttachmentUrl = (m: ChatMessage) => m.attachment_url || m.attachmentUrl || "";
const getAttachmentType = (m: ChatMessage) => m.attachment_type || m.attachmentType || "";
const isImageAttachment = (m: ChatMessage) => getAttachmentType(m).startsWith("image/");

const formatTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const formatDateSeparator = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
};

const isSameDay = (d1: string, d2: string) =>
  new Date(d1).toDateString() === new Date(d2).toDateString();

const getPresenceColor = (status?: string) => {
  if (!status || status === "online") return "bg-green-500";
  if (["busy", "calling", "in-meeting", "do-not-disturb"].includes(status)) return "bg-red-500";
  if (status === "away") return "bg-yellow-500";
  return "bg-green-500";
};

const getPresenceLabel = (status?: string) => {
  if (!status || status === "online") return "Online";
  if (status === "busy") return "Busy";
  if (status === "calling") return "In a call";
  if (status === "in-meeting") return "In a meeting";
  if (status === "do-not-disturb") return "Do not disturb";
  if (status === "away") return "Away";
  return "Online";
};

const EMOJI_LIST = [
  "😀","😂","🤣","😊","😍","🥰","😘","😎","🤩","🥳",
  "😇","🤗","🤔","🤭","🤫","😏","😌","😴","🥱","😷",
  "🤒","🤕","🤢","🤮","🥵","🥶","😱","😨","😰","😥",
  "😢","😭","😤","😡","🤬","😈","👿","💀","💩","🤡",
  "👻","👽","🤖","😺","😸","😹","😻","😼","😽","🙀",
  "🙌","👏","🤝","👍","👎","👊","✊","🤞","✌️","🤟",
  "👌","👉","👆","👇","☝️","✋","👋","🤙","💪","🙏",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","💕",
  "💗","💖","💘","💝","💯","💢","🔥","⭐","🌟","✨",
  "⚡","💥","🍀","🌈","☀️","🌤️","⛅","🌧️","⛈️","❄️",
  "⛄","💨","🌪️","🌊","💧","🎉","🎊","🎈","🎁","🎀",
  "🏆","🥇","🥈","🥉","⚽","🏀","🏈","⚾","🎾","🏐",
  "🎯","🎪","🎨","🎬","🎤","🎧","🎼","🎵","🎶","🎸",
  "🎹","🎺","🥁","🎻","🎲","♟️","🎯","🎮","🕹️","🎰",
  "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐",
  "🛻","🚚","🚛","🚜","🛵","🏍️","🚲","🛴","🛹","🛼",
  "✈️","🚀","🛸","🚁","🛶","⛵","🚤","🛥️","🛳️","⛴️",
  "🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪",
  "🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌",
  "🛕","🕍","⛩️","🕋","⛲","⛺","🏕️","🗾","🏔️","🌋",
  "🏖️","🏜️","🏝️","🏞️","🍕","🍔","🍟","🌭","🍿","🧂",
  "🥓","🥚","🍳","🧇","🥞","🧈","🍞","🥐","🥨","🥯",
  "🥖","🫓","🧀","🥗","🥙","🥪","🌮","🌯","🫔","🥫",
  "🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤","🍙",
  "🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧","🍨","🍦",
  "🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍩","🍪",
];

// ==========================================
// Sub-Components
// ==========================================

const EmojiPicker = ({ onSelect }: { onSelect: (emoji: string) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
          title="Emoji"
        >
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-popover border-border" align="start" side="top" sideOffset={8}>
        <div className="p-2 border-b border-border">
          <p className="text-xs font-medium text-popover-foreground">Emoji</p>
        </div>
        <div className="h-64 overflow-y-auto p-2">
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJI_LIST.map((emoji, idx) => (
              <button
                key={`${emoji}-${idx}`}
                type="button"
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
                className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-lg transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const TypingIndicator = () => (
  <div className="flex items-center gap-1 px-4 py-2">
    <div className="flex gap-1">
      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
    </div>
    <span className="text-xs text-muted-foreground ml-2">typing...</span>
  </div>
);

const DateSeparator = ({ date }: { date: string }) => (
  <div className="flex items-center gap-4 py-2">
    <div className="flex-1 h-px bg-border" />
    <span className="text-xs font-medium text-muted-foreground shrink-0">{formatDateSeparator(date)}</span>
    <div className="flex-1 h-px bg-border" />
  </div>
);

const MessageBubble = ({
  message,
  isOwn,
  isGrouped,
  showSender,
  senderName,
  onRetry,
}: {
  message: ChatMessage;
  isOwn: boolean;
  isGrouped: boolean;
  showSender: boolean;
  senderName: string;
  members: TeamMember[];
  onRetry?: () => void;
}) => {
  const isFailed = message.status === "failed";
  const isSending = message.status === "sending";
  const attachmentUrl = getAttachmentUrl(message);
  const isImage = isImageAttachment(message);
  const isFile = !!attachmentUrl && !isImage;

  return (
    <div className={cn("flex", isOwn ? "justify-end" : "justify-start", isGrouped && "mt-0.5")}>
      <div
        className={cn(
          "max-w-[80%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 transition-all overflow-hidden",
          isOwn
            ? cn(
                "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg",
                isGrouped ? "rounded-tr-md" : "rounded-tr-2xl"
              )
            : cn(
                "bg-card text-foreground border border-border shadow-sm",
                isGrouped ? "rounded-tl-md" : "rounded-tl-2xl"
              ),
          isFailed && "border-red-500/50 bg-red-50 dark:bg-red-950/30"
        )}
      >
        {showSender && !isOwn && (
          <p className="text-xs font-semibold mb-1 text-blue-500 dark:text-blue-400">{senderName}</p>
        )}

        {isImage && (
          <div className="mb-2 -mx-1 -mt-1">
            <img
              src={attachmentUrl}
              alt="Shared image"
              className="max-w-full rounded-lg max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(attachmentUrl, "_blank")}
              loading="lazy"
            />
          </div>
        )}

        {isFile && (
          <div className="mb-2 flex items-center gap-2 p-2 rounded-lg bg-black/10 dark:bg-white/10">
            <CircleDot className="h-4 w-4 shrink-0 opacity-70" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate opacity-90">
                {attachmentUrl.split("/").pop()?.split("?")[0] || "File"}
              </p>
              <p className="text-[10px] opacity-60">Click to view</p>
            </div>
            <a
              href={attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs opacity-70 hover:opacity-100 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              Download
            </a>
          </div>
        )}

        {message.content && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
        )}

        <div className={cn("flex items-center gap-1.5 mt-1", isOwn ? "justify-end" : "justify-start")}>
          <p className="text-[10px] opacity-60">{formatTime(getMsgTime(message))}</p>
          {isOwn && (
            isFailed ? (
              <button onClick={onRetry} className="text-red-300 hover:text-red-100" title="Retry">
                <CircleDot className="h-3 w-3" />
              </button>
            ) : isSending ? (
              <Loader2 className="h-3 w-3 animate-spin opacity-60" />
            ) : (
              <Check className="h-3 w-3 opacity-60" />
            )
          )}
        </div>
      </div>
    </div>
  );
};

const ConversationListItem = ({
  conversation,
  isSelected,
  members,
  presence,
  searchQuery,
  onClick,
}: {
  conversation: ConversationView;
  isSelected: boolean;
  members: TeamMember[];
  presence: Record<string, string>;
  searchQuery: string;
  onClick: () => void;
}) => {
  const name = getConversationName(members, conversation);
  const lastMsg = getLastMsg(conversation);
  const lastTime = getLastMsgTime(conversation);
  const presenceUid = getParticipantUserId(getDirectParticipant(conversation));
  const status = presence[presenceUid];

  const renderName = () => {
    if (!searchQuery.trim()) return name;
    const idx = name.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx === -1) return name;
    return (
      <>
        {name.substring(0, idx)}
        <span className="bg-yellow-200 dark:bg-yellow-800 text-inherit rounded px-0.5">
          {name.substring(idx, idx + searchQuery.length)}
        </span>
        {name.substring(idx + searchQuery.length)}
      </>
    );
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full p-3 text-left hover:bg-muted/80 transition-all duration-150 border-l-4 border-transparent",
        isSelected && "bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-l-blue-500"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="h-11 w-11">
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white font-semibold text-sm">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          {conversation.type === "direct" && (
            <span className={cn("absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-card", getPresenceColor(status))} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center gap-2">
            <p className="font-medium truncate text-sm text-foreground">{renderName()}</p>
            {lastTime && <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(lastTime)}</span>}
          </div>
          <div className="flex justify-between items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground truncate">{lastMsg || "No messages yet"}</p>
            {(conversation.unreadCount ?? 0) > 0 && (
              <span className="shrink-0 h-5 min-w-[20px] px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                {conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};

const TeamMemberMultiSelect = ({
  selected,
  onChange,
  members,
  placeholder = "Select participants...",
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  members: TeamMember[];
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between min-h-[42px] h-auto">
          <div className="flex flex-wrap gap-1">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map((id) => {
                const member = members.find((d) => d.id === id);
                return (
                  <Badge key={id} variant="secondary" className="text-xs">
                    {member?.name || id}
                    <button
                      type="button"
                      className="ml-1 rounded-full outline-none focus:ring-2 focus:ring-ring"
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
      <PopoverContent className="w-full p-0 bg-popover border-border" align="start">
        <Command className="bg-transparent">
          <CommandInput placeholder="Search team members..." className="text-popover-foreground" />
          <CommandList className="bg-popover">
            <CommandEmpty className="py-2 px-2 text-muted-foreground">No team members found.</CommandEmpty>
            <CommandGroup>
              {members.map((member) => {
                const isSelected = selected.includes(member.id);
                return (
                  <CommandItem
                    key={member.id}
                    value={member.name}
                    onSelect={() => {
                      onChange(isSelected ? selected.filter((s) => s !== member.id) : [...selected, member.id]);
                    }}
                    className="flex items-center gap-2 py-2 cursor-pointer text-popover-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  >
                    <div className={cn("h-4 w-4 rounded border flex items-center justify-center transition-colors", isSelected ? "bg-primary border-primary" : "border-muted-foreground/50")}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">{getInitials(member.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm flex-1 truncate">{member.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// ==========================================
// Main Component
// ==========================================
export default function Chat() {
  const { data: conversations, isLoading: convLoading, error: convError, refetch: refetchConv } = useConversations();
  const createConversation = useCreateConversation();
  const sendMessage = useSendMessage();
  const { toast } = useToast();
  const { socket, isConnected, joinConversation, on, off } = useSocket({
    userId: CURRENT_USER_ID(),
    businessId: localStorage.getItem("businessId") || "",
  });

  // State
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileShowSidebar, setMobileShowSidebar] = useState(true);
  const [userPresence, setUserPresence] = useState<Record<string, string>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [conversationForm, setConversationForm] = useState<CreateConversationInput>({
    name: "",
    type: "direct",
    participantIds: [],
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const pendingMessageIdsRef = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch team members
  useEffect(() => {
    api.get("/team").then((res) => setTeamMembers(unwrapApiData<TeamMember[]>(res.data, ""))).catch(() => {});
  }, []);

  // Error toast
  useEffect(() => {
    if (convError) toast({ variant: "destructive", title: "Error", description: getApiMessage(convError, "Failed to load conversations") });
  }, [convError, toast]);

  // Join conversation room via socket
  useEffect(() => {
    if (selectedConversation?.id && isConnected) joinConversation(selectedConversation.id);
  }, [selectedConversation?.id, isConnected, joinConversation]);

  // Reset local messages on conversation change
  useEffect(() => {
    setLocalMessages([]);
    pendingMessageIdsRef.current.clear();
    setTypingUsers({});
    setMobileShowSidebar(false);
  }, [selectedConversation?.id]);

  // Fetch messages
  const { data: messagesData } = useMessages(selectedConversation?.id || "", 1, 100);

  // Combine & deduplicate messages
  const combinedMessages = useMemo(() => {
    const apiMsgs = (messagesData?.messages || []) as ChatMessage[];
    const all = [...apiMsgs, ...localMessages];
    const seen = new Set<string>();
    return all
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .sort((a, b) => new Date(getMsgTime(a)).getTime() - new Date(getMsgTime(b)).getTime());
  }, [messagesData?.messages, localMessages]);

  // Group messages for visual grouping
  const groupedMessages = useMemo(() => {
    const groups: { type: "date" | "message"; data: ChatMessage | string; showSender?: boolean; senderName?: string; isGrouped?: boolean }[] = [];
    let lastSenderId = "";
    let lastDate = "";

    combinedMessages.forEach((msg) => {
      const msgTime = getMsgTime(msg);
      const senderId = getMsgSenderId(msg);
      const isOwn = senderId === CURRENT_USER_ID();

      if (!isSameDay(msgTime, lastDate)) {
        groups.push({ type: "date", data: msgTime });
        lastDate = msgTime;
        lastSenderId = "";
      }

      const isMsgGrouped = senderId === lastSenderId && !msg.isOptimistic;
      const showSender = !isOwn && !isMsgGrouped && selectedConversation?.type === "group";
      const senderName = getMsgSenderName(teamMembers, msg);

      groups.push({ type: "message", data: msg, isGrouped: isMsgGrouped, showSender, senderName });
      lastSenderId = senderId;
    });

    return groups;
  }, [combinedMessages, teamMembers, selectedConversation?.type]);

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    if (!searchQuery.trim()) return conversations as ConversationView[];
    const q = searchQuery.toLowerCase();
    return (conversations as ConversationView[]).filter((c) => getConversationName(teamMembers, c).toLowerCase().includes(q));
  }, [conversations, searchQuery, teamMembers]);

  // Sort conversations by last message time
  const sortedConversations = useMemo(() => {
    return [...filteredConversations].sort((a, b) => {
      const timeA = new Date(getLastMsgTime(a)).getTime() || 0;
      const timeB = new Date(getLastMsgTime(b)).getTime() || 0;
      return timeB - timeA;
    });
  }, [filteredConversations]);

  // Scroll handling
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (force || isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [combinedMessages.length, scrollToBottom]);

  // Socket: New message
  useEffect(() => {
    if (!isConnected || !selectedConversation?.id) return;

    const handleNewMessage = (message: ChatMessage) => {
      setLocalMessages((prev) => {
        const optimistic = prev.find((m) => m.isOptimistic && pendingMessageIdsRef.current.has(m.id));
        if (optimistic) {
          pendingMessageIdsRef.current.delete(optimistic.id);
          return prev.map((m) => (m.id === optimistic.id ? { ...message, id: message.id || optimistic.id, status: "sent" } : m));
        }
        return [...prev, { ...message, id: message.id || Date.now().toString(), status: "sent" }];
      });
      AudioUtils.playNotification();
      scrollToBottom(true);
    };

    on("chat:message", handleNewMessage);
    return () => off("chat:message", handleNewMessage);
  }, [selectedConversation?.id, isConnected, on, off, scrollToBottom]);

  // Socket: Presence
  useEffect(() => {
    if (!isConnected) return;
    const handler = ({ userId, status }: { userId: string; status: string }) => setUserPresence((p) => ({ ...p, [userId]: status }));
    on("user-presence-updated", handler);
    return () => off("user-presence-updated", handler);
  }, [isConnected, on, off]);

  // Socket: Typing indicators
  useEffect(() => {
    if (!isConnected || !selectedConversation?.id) return;

    const handleTyping = ({ userId, userName: name }: { userId: string; userName?: string }) => {
      if (userId === CURRENT_USER_ID()) return;
      setTypingUsers((p) => ({ ...p, [userId]: name || "Someone" }));
    };

    const handleStopTyping = ({ userId }: { userId: string }) => {
      setTypingUsers((p) => {
        const next = { ...p };
        delete next[userId];
        return next;
      });
    };

    on("chat:typing", handleTyping);
    on("chat:stop-typing", handleStopTyping);
    return () => {
      off("chat:typing", handleTyping);
      off("chat:stop-typing", handleStopTyping);
    };
  }, [selectedConversation?.id, isConnected, on, off]);

  // Emit typing status
  const emitTypingStatus = useCallback(
    (isTyping: boolean) => {
      if (!socket || !selectedConversation?.id) return;
      socket.emit(isTyping ? "chat:typing" : "chat:stop-typing", {
        conversationId: selectedConversation.id,
        userId: CURRENT_USER_ID(),
        userName: CURRENT_USER_NAME(),
      });
    },
    [socket, selectedConversation?.id]
  );

  const handleInputChange = (value: string) => {
    setNewMessage(value);
    emitTypingStatus(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitTypingStatus(false), 2000);
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
  };

  // ==========================================
  // Conversation & Message Handlers
  // ==========================================
  const handleCreateConversation = async () => {
    if (conversationForm.participantIds.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Please select at least one participant" });
      return;
    }
    setIsProcessing(true);
    try {
      const conv = await createConversation.mutateAsync(conversationForm);
      setIsCreateDialogOpen(false);
      setConversationForm({ name: "", type: "direct", participantIds: [] });
      setSelectedConversation(conv);
      toast({ title: "Conversation created" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: getApiMessage(err, "Failed to create conversation") });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !newMessage.trim()) return;

    const content = newMessage.trim();
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversationId: selectedConversation.id,
      senderId: CURRENT_USER_ID(),
      senderName: CURRENT_USER_NAME(),
      content,
      createdAt: new Date().toISOString(),
      status: "sending",
      isOptimistic: true,
    };

    setLocalMessages((prev) => [...prev, optimisticMsg]);
    pendingMessageIdsRef.current.add(tempId);
    setNewMessage("");
    emitTypingStatus(false);
    scrollToBottom(true);

    try {
      await sendMessage.mutateAsync({
        conversationId: selectedConversation.id,
        data: { content },
      });

      setLocalMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "sent" } : m)));
    } catch (err) {
      setLocalMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
      toast({ variant: "destructive", title: "Error", description: getApiMessage(err, "Failed to send message") });
    }
  };

  const handleRetryMessage = async (message: ChatMessage) => {
    if (!selectedConversation || !message.content) return;

    setLocalMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, status: "sending" } : m)));

    try {
      await sendMessage.mutateAsync({
        conversationId: selectedConversation.id,
        data: { content: message.content },
      });
      setLocalMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, status: "sent" } : m)));
    } catch {
      setLocalMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, status: "failed" } : m)));
    }
  };

  const isTyping = Object.keys(typingUsers).length > 0;
  const hasInputContent = !!newMessage.trim();

  // ==========================================
  // Render
  // ==========================================
  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-120px)] sm:h-[calc(100vh-80px)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {!mobileShowSidebar && selectedConversation && (
              <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setMobileShowSidebar(true)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Chat</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Communicate with your team</p>
            </div>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl" onClick={() => setMobileShowSidebar(false)}>
                <Plus className="h-4 w-4 mr-2" />New Chat
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New Conversation</DialogTitle>
                <DialogDescription>Start a chat with team members</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Select value={conversationForm.type} onValueChange={(v) => setConversationForm({ ...conversationForm, type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">Direct Message</SelectItem>
                      <SelectItem value="group">Group Chat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {conversationForm.type === "group" && (
                  <div className="grid gap-2">
                    <Label>Name</Label>
                    <Input value={conversationForm.name} onChange={(e) => setConversationForm({ ...conversationForm, name: e.target.value })} placeholder="Group name" />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Participants</Label>
                  <TeamMemberMultiSelect selected={conversationForm.participantIds} onChange={(ids) => setConversationForm({ ...conversationForm, participantIds: ids })} members={teamMembers} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isProcessing}>Cancel</Button>
                <Button onClick={handleCreateConversation} disabled={isProcessing || conversationForm.participantIds.length === 0}>
                  {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Chat Container */}
        <div className="flex flex-1 overflow-hidden rounded-2xl border bg-card shadow-lg">
          {/* Sidebar */}
          <div className={cn("w-full sm:w-80 border-r border-border flex flex-col bg-card/80 backdrop-blur-sm shrink-0", mobileShowSidebar ? "flex" : "hidden sm:flex")}>
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 bg-muted/50"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1">
              {convLoading ? (
                <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : sortedConversations.length > 0 ? (
                <div className="divide-y divide-border/50">
                  {sortedConversations.map((conv) => (
                    <ConversationListItem
                      key={conv.id}
                      conversation={conv}
                      isSelected={selectedConversation?.id === conv.id}
                      members={teamMembers}
                      presence={userPresence}
                      searchQuery={searchQuery}
                      onClick={() => setSelectedConversation(conv)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">{searchQuery ? "No matching conversations" : "No conversations yet"}</p>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedConversation ? (
              <>
                {/* Chat Header */}
                <div className="p-3 sm:p-4 border-b border-border flex items-center justify-between bg-card/50 backdrop-blur-sm shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white font-semibold text-xs">
                          {getInitials(getConversationName(teamMembers, selectedConversation as ConversationView))}
                        </AvatarFallback>
                      </Avatar>
                      {selectedConversation.type === "direct" && (
                        <span className={cn("absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-card", getPresenceColor(userPresence[getParticipantUserId(getDirectParticipant(selectedConversation as ConversationView))]))} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{getConversationName(teamMembers, selectedConversation as ConversationView)}</h3>
                      <p className="text-xs text-muted-foreground">
                        {selectedConversation.type === "direct" ? getPresenceLabel(userPresence[getParticipantUserId(getDirectParticipant(selectedConversation as ConversationView))]) : `${selectedConversation.participants.length} members`}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem><Users className="h-4 w-4 mr-2" />View Members</DropdownMenuItem>
                      <DropdownMenuItem><Search className="h-4 w-4 mr-2" />Search in Chat</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600">Mute Conversation</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Messages */}
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-1 bg-gradient-to-b from-background to-muted/30">
                  {groupedMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <MessageSquare className="h-14 w-14 text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground">No messages yet</p>
                      <p className="text-sm text-muted-foreground/70 mt-1">Send the first message to start</p>
                    </div>
                  ) : (
                    groupedMessages.map((item, idx) => {
                      if (item.type === "date") return <DateSeparator key={`date-${idx}`} date={item.data as string} />;
                      const msg = item.data as ChatMessage;
                      const isOwn = getMsgSenderId(msg) === CURRENT_USER_ID();
                      return (
                        <MessageBubble
                          key={msg.id}
                          message={msg}
                          isOwn={isOwn}
                          isGrouped={!!item.isGrouped}
                          showSender={!!item.showSender}
                          senderName={item.senderName || ""}
                          members={teamMembers}
                          onRetry={msg.status === "failed" ? () => handleRetryMessage(msg) : undefined}
                        />
                      );
                    })
                  )}
                  {isTyping && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-3 sm:p-4 border-t border-border bg-card/50 backdrop-blur-sm shrink-0">
                  <div className="flex gap-2 items-end">
                    <EmojiPicker onSelect={handleEmojiSelect} />
                    <div className="flex-1 relative">
                      <Textarea
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={(e) => handleInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        className="flex-1 min-h-[40px] max-h-[120px] resize-none bg-muted/50 border-border rounded-xl py-2.5 px-4 text-sm focus-visible:ring-1 focus-visible:ring-blue-500 pr-12"
                        rows={1}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!hasInputContent}
                        size="icon"
                        className="absolute right-1.5 bottom-1.5 h-8 w-8 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-30"
                        title="Send message"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-blue-500/5 to-purple-500/5 p-8">
                {mobileShowSidebar ? null : (
                  <>
                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center mb-4">
                      <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                    <h3 className="text-lg font-semibold text-muted-foreground">Select a conversation</h3>
                    <p className="text-sm text-muted-foreground/70 mt-1 text-center">Choose a conversation or start a new one</p>
                    <Button variant="outline" className="mt-6 sm:hidden" onClick={() => setMobileShowSidebar(true)}>
                      <Menu className="h-4 w-4 mr-2" />Show Conversations
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}