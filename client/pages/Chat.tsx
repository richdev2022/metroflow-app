import { useState, useEffect, useRef, useMemo, useCallback, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Phone,
  Video,
  Mic,
  Paperclip,
  ImageIcon,
  FileText,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  useConversations,
  useCreateConversation,
  useMessages,
  useSendMessage,
  useCreateCall,
  uploadChatMedia,
} from "@/lib/meetings-chat-calls";
import { Conversation, CreateConversationInput, TeamMember, MessageTypeName, SendMessageInput } from "@shared/api";
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
import { formatTime as formatTimePref } from "@/lib/datetime";
import { VoiceNotePlayer } from "@/components/chat/VoiceNotePlayer";
import { VoiceRecorderPill } from "@/components/chat/VoiceRecorderPill";
import { ChatProfileModal, ChatProfilePerson } from "@/components/chat/ChatProfileModal";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  ImageAttachment,
  VideoAttachment,
  DocumentAttachment,
  StickerAttachment,
} from "@/components/chat/AttachmentMedia";
import { StickerEmojiGifPanel } from "@/components/chat/StickerEmojiGifPanel";
import { CallLogRow } from "@/components/chat/CallLogRow";
import {
  CHAT_MEDIA_MAX_BYTES,
  formatFileSize,
  isSoloEmojiMessage,
  guessMediaKind,
} from "@/lib/chat-media";
import type { GifObject } from "@shared/api";

// ==========================================
// Types & Interfaces
// ==========================================
type ChatParticipant = Conversation["participants"][number] & {
  userId?: string;
  user_id?: string;
  name?: string;
  userName?: string;
  user_name?: string;
  lastSeen?: string | null;
  last_seen?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
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
  /** WhatsApp-style attachment metadata (batch 3). */
  attachment_name?: string;
  attachmentName?: string;
  attachment_size?: number;
  attachmentSize?: number;
  message_type?: string;
  messageType?: string;
  /** Local blob URL for optimistic image/video previews while uploading. */
  localPreviewUrl?: string;
  /** True while the attachment file is still uploading to /chat/media. */
  uploading?: boolean;
  status?: "sending" | "sent" | "failed" | "read";
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
  /** Backend display helpers (GET /chat/conversations): direct -> other user's
   *  name/avatar; group -> group name. Used for list rows + chat header. */
  displayName?: string | null;
  displayAvatarUrl?: string | null;
  isGroup?: boolean;
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
  // Backend-provided display name wins: direct chats already resolve to the
  // OTHER participant's name, groups to the group name.
  const backendName = conv.displayName?.trim();
  if (backendName) return backendName;
  if (conv.name?.trim()) return conv.name;
  if (conv.type === "direct") {
    const p = getDirectParticipant(conv);
    return getParticipantName(members, getParticipantUserId(p), p);
  }
  return "Group Chat";
};

/** Best avatar for a conversation row/header: backend display avatar (direct
 *  chats) resolved to an absolute URL, else the other participant's avatar. */
const getConversationAvatarUrl = (conv: ConversationView) => {
  const raw =
    conv.displayAvatarUrl ||
    (conv.type === "direct" ? getDirectParticipant(conv)?.avatarUrl : null) ||
    "";
  return resolveMediaUrl(raw);
};

const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

const getMsgSenderId = (m: ChatMessage) => m.senderId || m.sender_id || "";

const getMsgSenderName = (members: TeamMember[], m: ChatMessage) =>
  m.senderName || m.sender_name || getParticipantName(members, getMsgSenderId(m));

const getMsgTime = (m: ChatMessage) => m.createdAt || m.created_at || new Date().toISOString();

const getLastMsg = (c: ConversationView) => c.lastMessage || c.last_message || c.lastmessage || "";

const getLastMsgTime = (c: ConversationView) =>
  c.lastMessageAt || c.last_message_at || c.lastmessageat || "";

const getParticipantLastSeen = (p?: ChatParticipant) => p?.lastSeen || p?.last_seen || null;

const formatRelativeTime = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;
  const now = new Date().getTime();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return null;

  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffYear >= 1) return diffYear === 1 ? "a year ago" : `${diffYear} years ago`;
  if (diffMonth >= 1) return diffMonth === 1 ? "a month ago" : `${diffMonth} months ago`;
  if (diffWeek >= 1) return diffWeek === 1 ? "a week ago" : `${diffWeek} weeks ago`;
  if (diffDay >= 1) return diffDay === 1 ? "yesterday" : `${diffDay} days ago`;
  if (diffHr >= 1) return diffHr === 1 ? "an hour ago" : `${diffHr} hours ago`;
  if (diffMin >= 1) return diffMin === 1 ? "a minute ago" : `${diffMin} min ago`;
  return "just now";
};

const ONLINE_THRESHOLD_MS = 60_000;
const isRecentlyOnline = (dateStr: string | null | undefined): boolean => {
  if (!dateStr) return false;
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return false;
  return new Date().getTime() - then <= ONLINE_THRESHOLD_MS;
};

const getParticipantStatusLine = (
  participant: ChatParticipant | undefined,
  socketPresence: string | undefined
): { line: string; isOnlineDot: boolean } => {
  const presenceStatus = socketPresence;
  const activeStatuses = ["online", "busy", "in-meeting", "calling", "do-not-disturb"];
  const isActivePresence = !!presenceStatus && activeStatuses.includes(presenceStatus);
  const lastSeen = getParticipantLastSeen(participant);

  if (isActivePresence) {
    return { line: getPresenceLabel(presenceStatus), isOnlineDot: true };
  }

  if (isRecentlyOnline(lastSeen)) {
    return { line: "Online", isOnlineDot: true };
  }

  const relative = formatRelativeTime(lastSeen);
  if (relative) {
    return { line: `Last seen ${relative}`, isOnlineDot: false };
  }

  return { line: "Offline", isOnlineDot: false };
};

// Helpers for rendering received attachments from others
// getAttachmentUrl resolves the raw attachment URL to an ABSOLUTE playable
// URL (lib/media-url.ts) — the backend may return root-relative paths like
// "/uploads/x.webm", which 404 when the app and API are on different origins.
// blob:/data: optimistic URLs pass through untouched.
const getAttachmentUrl = (m: ChatMessage) =>
  resolveMediaUrl(m.attachment_url || m.attachmentUrl || "");
const getAttachmentType = (m: ChatMessage) => m.attachment_type || m.attachmentType || "";
const getMessageType = (m: ChatMessage) => (m.messageType || m.message_type || "").toLowerCase();
const getAttachmentName = (m: ChatMessage) => m.attachmentName || m.attachment_name || "";
const getAttachmentSize = (m: ChatMessage) => m.attachmentSize ?? m.attachment_size ?? null;

/** Backend batch-3 kinds are single words ('image'); legacy rows store a MIME ('image/png'). */
const isImageAttachment = (m: ChatMessage) => {
  const type = getAttachmentType(m);
  return type === "image" || type.startsWith("image/");
};
const isVideoAttachment = (m: ChatMessage) => {
  const type = getAttachmentType(m);
  return type === "video" || type.startsWith("video/");
};
const isGifAttachment = (m: ChatMessage) =>
  getAttachmentType(m) === "gif" || getMessageType(m) === "gif";
const isStickerMessage = (m: ChatMessage) =>
  getAttachmentType(m) === "sticker" || getMessageType(m) === "sticker";

const isVoiceNoteContent = (content?: string) =>
  !!content && (content === "Voice note" || content === "🎤 Voice note");

// A message carrying a voice note: backend tags uploads as `audio`, and we
// fall back to sniffing the attachment URL for legacy rows.
const isAudioAttachment = (m: ChatMessage) => {
  if (isImageAttachment(m) || isVideoAttachment(m) || isGifAttachment(m)) return false;
  const type = getAttachmentType(m);
  if (type === "audio" || type.startsWith("audio") || getMessageType(m) === "voice") return true;
  const url = getAttachmentUrl(m);
  if (!url) return false;
  return /\.(webm|mp3|m4a|aac|ogg|opus|wav)(\?|#|$)/i.test(url);
};

// Message timestamps honour the app-wide 12h/24h preference
// (Settings -> Time format, persisted via PUT /settings { time_format }).
const formatTime = (dateStr: string) => formatTimePref(dateStr);

// Compact list timestamp: 4:32 PM / Yesterday / Tue / Mar 4
const formatListTime = (dateStr: string) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.floor((today.getTime() - that.getTime()) / 86_400_000);
  if (dayDiff === 0) return formatTime(dateStr);
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

// Deterministic avatar gradient per name so every chat has a distinct hue
const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-fuchsia-500 to-pink-600",
  "from-rose-500 to-red-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
  "from-cyan-500 to-sky-600",
];
const getAvatarGradient = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

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

// (Emoji / sticker / GIF picking moved to components/chat/StickerEmojiGifPanel.tsx)

const TypingIndicator = () => (
  <div className={cn("flex justify-start px-2 sm:px-4 pb-1 animate-in fade-in duration-200")}>
    <div className="bg-card border border-border shadow-sm rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" />
    </div>
  </div>
);

const DateSeparator = ({ date }: { date: string }) => (
  <div className="flex justify-center py-3">
    <span className="px-3 py-1 rounded-full bg-muted/80 text-[11px] font-medium text-muted-foreground backdrop-blur-sm border border-border/60">
      {formatDateSeparator(date)}
    </span>
  </div>
);

const MessageBubble = ({
  message,
  isOwn,
  isGrouped,
  showSender,
  senderName,
  senderAvatarUrl,
  onSenderClick,
  onRetry,
}: {
  message: ChatMessage;
  isOwn: boolean;
  isGrouped: boolean;
  showSender: boolean;
  senderName: string;
  senderAvatarUrl?: string;
  /** Opens the sender's profile modal (chat header/bubble click). */
  onSenderClick?: () => void;
  members: TeamMember[];
  onRetry?: () => void;
}) => {
  const isFailed = message.status === "failed";
  const isSending = message.status === "sending";
  const isRead = message.status === "read";
  const uploading = !!message.uploading;
  const attachmentUrl = getAttachmentUrl(message);
  const messageType = getMessageType(message);
  const isImage = isImageAttachment(message);
  const isVideo = isVideoAttachment(message);
  const isAudio = isAudioAttachment(message);
  const isGif = isGifAttachment(message);
  const isSticker = isStickerMessage(message);
  const isFile = !!attachmentUrl && !isImage && !isVideo && !isAudio && !isGif;
  // Voice-note placeholder text (“🎤 Voice note”) is represented by the
  // player itself, so don't render it twice.
  const hideContent = isAudio && isVoiceNoteContent(message.content);

  // WhatsApp-style "transparent" messages render WITHOUT a bubble background:
  //  - big-emoji text (1-3 emoji, no attachment)
  //  - stickers (huge emoji or sticker attachment)
  //  - GIFs without a caption (GIFs WITH a caption stay in a bubble)
  const soloEmoji = !attachmentUrl && isSoloEmojiMessage(message.content);
  const transparent = isSticker || (isGif && !message.content) || soloEmoji;

  const timestampRow = (
    <div className={cn("flex items-center gap-1", transparent ? "justify-center" : isOwn ? "justify-end" : "justify-start")}>
      <p className={cn("text-[10px]", transparent ? "text-muted-foreground/70" : "opacity-60")}>
        {formatTime(getMsgTime(message))}
      </p>
      {isOwn && !transparent && (
        isFailed ? (
          <button onClick={onRetry} className="text-red-300 hover:text-red-100" title="Retry">
            <CircleDot className="h-3 w-3" />
          </button>
        ) : isSending ? (
          <Loader2 className="h-3 w-3 animate-spin opacity-60" />
        ) : (
          <span className="opacity-60" title={isRead ? "Read" : "Sent"}><Check className={cn("h-3 w-3", isRead && "text-cyan-200")} /></span>
        )
      )}
    </div>
  );

  // ------------------------------------------------------------
  // Transparent renderings (no bubble background)
  // ------------------------------------------------------------
  if (transparent) {
    return (
      <div className={cn("flex items-end gap-2 group", isOwn ? "justify-end" : "justify-start", isGrouped ? "mt-0.5" : "mt-2")}>
        {!isOwn && (
          <div className="w-7 shrink-0 flex items-end">
            {!isGrouped && (
              <button
                type="button"
                onClick={onSenderClick}
                disabled={!onSenderClick}
                aria-label={`View ${senderName || "sender"} profile`}
                className={cn(
                  "rounded-full transition-all",
                  onSenderClick && "cursor-pointer hover:ring-2 hover:ring-blue-500/40 active:scale-95"
                )}
              >
                <Avatar className="h-7 w-7">
                  {senderAvatarUrl && <AvatarImage src={senderAvatarUrl} alt={senderName || "Sender"} />}
                  <AvatarFallback className={cn("bg-gradient-to-br text-white font-semibold text-[10px]", getAvatarGradient(senderName || "?"))}>
                    {getInitials(senderName || "?")}
                  </AvatarFallback>
                </Avatar>
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col items-center max-w-[82%] sm:max-w-[68%] animate-in fade-in slide-in-from-bottom-1 duration-200">
          {showSender && !isOwn && isGif && (
            <span className="mb-0.5 text-[11px] font-semibold text-blue-500 dark:text-blue-400">{senderName}</span>
          )}
          {isSticker && attachmentUrl && (
            <StickerAttachment url={attachmentUrl} alt={getAttachmentName(message) || "Sticker"} />
          )}
          {isSticker && !attachmentUrl && (
            <span className="select-none text-[96px] leading-none drop-shadow-sm" role="img" aria-label="Sticker">
              {message.content || "🙂"}
            </span>
          )}
          {isGif && attachmentUrl && (
            <StickerAttachment url={attachmentUrl} alt={getAttachmentName(message) || "GIF"} />
          )}
          {soloEmoji && (
            <span className="select-none text-[56px] leading-none" role="img" aria-label="Emoji">
              {message.content}
            </span>
          )}
          <div className="mt-0.5 w-full">{timestampRow}</div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // Standard bubble rendering (text + media attachments)
  // ------------------------------------------------------------
  return (
    <div className={cn("flex items-end gap-2 group", isOwn ? "justify-end" : "justify-start", isGrouped ? "mt-0.5" : "mt-2")}>
      {!isOwn && (
        <div className="w-7 shrink-0 flex items-end">
          {!isGrouped && (
            <button
              type="button"
              onClick={onSenderClick}
              disabled={!onSenderClick}
              aria-label={`View ${senderName || "sender"} profile`}
              className={cn(
                "rounded-full transition-all",
                onSenderClick && "cursor-pointer hover:ring-2 hover:ring-blue-500/40 active:scale-95"
              )}
            >
              <Avatar className="h-7 w-7">
                {senderAvatarUrl && <AvatarImage src={senderAvatarUrl} alt={senderName || "Sender"} />}
                <AvatarFallback className={cn("bg-gradient-to-br text-white font-semibold text-[10px]", getAvatarGradient(senderName || "?"))}>
                  {getInitials(senderName || "?")}
                </AvatarFallback>
              </Avatar>
            </button>
          )}
        </div>
      )}
      <div
        className={cn(
          "relative max-w-[82%] sm:max-w-[68%] px-3.5 py-2.5 transition-all animate-in fade-in slide-in-from-bottom-1 duration-200 overflow-hidden",
          isOwn
            ? cn(
                "bg-gradient-to-br from-blue-600 via-blue-600 to-violet-600 text-white rounded-2xl rounded-br-md shadow-md shadow-blue-600/15",
                isGrouped && "rounded-br-2xl rounded-tr-md"
              )
            : cn(
                "bg-card text-foreground border border-border/80 rounded-2xl rounded-bl-md shadow-sm",
                isGrouped && "rounded-bl-2xl rounded-tl-md"
              ),
          isFailed && "border-red-500/60 bg-red-50 dark:bg-red-950/30"
        )}
      >
        {showSender && !isOwn && (
          <button
            type="button"
            onClick={onSenderClick}
            disabled={!onSenderClick}
            className={cn(
              "block max-w-full truncate text-[11px] font-semibold mb-1 text-blue-500 dark:text-blue-400 text-left",
              onSenderClick && "cursor-pointer hover:underline underline-offset-2"
            )}
          >
            {senderName}
          </button>
        )}

        {isAudio && (
          <div className={cn("-mx-0.5", message.content && !hideContent && "mb-1.5")}>
            <VoiceNotePlayer src={attachmentUrl} isOwn={isOwn} />
          </div>
        )}

        {isImage && attachmentUrl && (
          <div className={cn(message.content ? "mb-2" : "")}>
            <ImageAttachment
              url={attachmentUrl}
              alt={getAttachmentName(message)}
              isOwn={isOwn}
              uploading={uploading}
            />
          </div>
        )}

        {isVideo && attachmentUrl && (
          <div className={cn(message.content ? "mb-2" : "")}>
            <VideoAttachment url={attachmentUrl} name={getAttachmentName(message)} isOwn={isOwn} uploading={uploading} />
          </div>
        )}

        {isGif && attachmentUrl && (
          <div className={cn(message.content ? "mb-2" : "")}>
            <StickerAttachment url={attachmentUrl} alt={getAttachmentName(message) || "GIF"} />
          </div>
        )}

        {((isFile && attachmentUrl) || (uploading && isFile)) && (
          <div className="mb-2">
            <DocumentAttachment
              url={attachmentUrl}
              name={getAttachmentName(message) || (uploading ? "Uploading file" : "")}
              size={getAttachmentSize(message)}
              isOwn={isOwn}
              uploading={uploading}
            />
          </div>
        )}

        {message.content && !hideContent && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
        )}

        {timestampRow}
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
  const avatarUrl = getConversationAvatarUrl(conversation);
  const directParticipant = getDirectParticipant(conversation);
  const presenceUid = getParticipantUserId(directParticipant);
  const statusInfo = getParticipantStatusLine(directParticipant, presence[presenceUid]);
  const dotColor = statusInfo.isOnlineDot
    ? getPresenceColor(presence[presenceUid])
    : "bg-gray-400";

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

  const unread = conversation.unreadCount ?? 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full px-3 py-2.5 mx-0 text-left transition-all duration-150 rounded-xl border border-transparent",
        "hover:bg-muted/70",
        isSelected
          ? "bg-gradient-to-r from-blue-500/15 to-violet-500/15 border-blue-500/30 shadow-sm"
          : unread > 0 && "bg-muted/40"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="h-12 w-12">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
            <AvatarFallback className={cn("bg-gradient-to-br text-white font-semibold text-sm shadow-sm", getAvatarGradient(name))}>
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          {conversation.type === "direct" && (
            <span className={cn("absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-card", dotColor)} />
          )}
          {conversation.type === "group" && (
            <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-card border border-border flex items-center justify-center">
              <Users className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center gap-2">
            <p className={cn("truncate text-sm text-foreground", unread > 0 ? "font-bold" : "font-medium")}>{renderName()}</p>
            {lastTime && (
              <span className={cn("text-[10px] shrink-0", unread > 0 ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-muted-foreground")}>
                {formatListTime(lastTime)}
              </span>
            )}
          </div>
          <div className="flex justify-between items-center gap-2 mt-0.5">
            <p className={cn("text-xs truncate", unread > 0 ? "text-foreground/80 font-medium" : "text-muted-foreground")}>
              {lastMsg || <span className="italic opacity-70">No messages yet</span>}
            </p>
            {unread > 0 && (
              <span className="shrink-0 h-5 min-w-[20px] px-1.5 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-white text-[10px] font-bold flex items-center justify-center shadow-sm shadow-blue-600/30">
                {unread > 99 ? "99+" : unread}
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
  const createCall = useCreateCall();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { socket, isConnected, joinConversation, on, off, inviteToCall } = useSocket({
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
  const [activeCallRingback, setActiveCallRingback] = useState<{ callId: string; stop: () => void } | null>(null);
  const [startingCall, setStartingCall] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);

  // Emoji/Sticker/GIF picker panel + attachment uploads (batch 3)
  const [pickerOpen, setPickerOpen] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Profile view modal (header avatar/name or message bubble sender click)
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profilePerson, setProfilePerson] = useState<ChatProfilePerson | null>(null);
  const [profileIsGroup, setProfileIsGroup] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const activeCallRingbackRef = useRef<{ callId: string; stop: () => void } | null>(null);
  activeCallRingbackRef.current = activeCallRingback;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const pendingMessageIdsRef = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch team members
  useEffect(() => {
    api.get("/team").then((res) => setTeamMembers(unwrapApiData<TeamMember[]>(res.data, ""))).catch(() => {});
  }, []);

  // Initialize audio context on first user interaction
  useEffect(() => {
    const initAudio = () => {
      AudioUtils.ensureInitialized().catch(err => {
        console.warn('Failed to initialize audio:', err);
      });
      // Remove event listeners after first interaction
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
    
    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);
    document.addEventListener('touchstart', initAudio);
    
    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
  }, []);

  // Error toast
  useEffect(() => {
    if (convError) toast({ variant: "destructive", title: "Error", description: getApiMessage(convError, "Failed to load conversations") });
  }, [convError, toast]);

  // Join conversation room via socket
  useEffect(() => {
    if (selectedConversation?.id && isConnected) joinConversation(selectedConversation.id);
  }, [selectedConversation?.id, isConnected, joinConversation]);

  // Reset local messages on conversation change + mark as read
  useEffect(() => {
    setLocalMessages([]);
    pendingMessageIdsRef.current.clear();
    setTypingUsers({});

    if (selectedConversation?.id) {
      // Inside a conversation on mobile -> hide the list panel.
      setMobileShowSidebar(false);
      const convId = selectedConversation.id;
      api.post(`/chat/conversations/${convId}/read`).then(() => {
        refetchConv();
      }).catch(() => {});
      if (socket && isConnected) {
        socket.emit('chat:mark-read', { conversationId: convId, userId: CURRENT_USER_ID() });
      }
    } else {
      // No conversation selected -> ALWAYS show the chat list on mobile.
      // (Previously this effect set mobileShowSidebar(false) on mount,
      // which hid the list behind a "back" button — the exact UX bug where
      // opening Chat on mobile required tapping a button before seeing
      // any conversations.)
      setMobileShowSidebar(true);
    }
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
      // The layout handles the hidden-tab case (OS notification + sound);
      // playing here as well would double the sound while the tab is hidden.
      if (typeof document === "undefined" || !document.hidden) {
        AudioUtils.playNotification();
      }
      scrollToBottom(true);
    };

    on("chat:message", handleNewMessage);
    // Real backend emits `message:created` (see POST /chat/conversations/:id/messages)
    on("message:created", handleNewMessage as any);
    return () => {
      off("chat:message", handleNewMessage);
      off("message:created", handleNewMessage as any);
    };
  }, [selectedConversation?.id, isConnected, on, off, scrollToBottom]);

  // Socket: Read receipts (backend emits `conversation:read` on markConversationAsRead)
  useEffect(() => {
    if (!isConnected) return;
    const handleRead = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (conversationId !== selectedConversation?.id || userId === CURRENT_USER_ID()) return;
      setLocalMessages((prev) => prev.map((m) => {
        const senderId = (m as any).senderId || (m as any).sender_id || '';
        const isOwn = senderId === CURRENT_USER_ID();
        return isOwn && m.status !== 'failed' ? { ...m, status: 'read' as const } : m;
      }));
    };
    on("conversation:read", handleRead as any);
    return () => off("conversation:read", handleRead as any);
  }, [selectedConversation?.id, isConnected, on, off]);

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

  // Socket: Call lifecycle (stop ringback when answer/reject/end received)
  useEffect(() => {
    if (!on || !off) return;
    const doStop = () => {
      try { activeCallRingbackRef.current?.stop(); } catch {}
      try { AudioUtils.stopAllRingtones(); } catch {}
    };
    const stopForThisCall = (payload: any) => {
      const cur = activeCallRingbackRef.current;
      if (!cur) return;
      const matchId = payload?.callId || payload?.id || payload;
      if (!matchId || String(matchId) === String(cur.callId)) {
        doStop();
      }
    };
    on("call:accepted", stopForThisCall as any);
    on("call:answered", stopForThisCall as any);
    on("call:rejected", stopForThisCall as any);
    on("call:ended", stopForThisCall as any);
    on("call:timeout", stopForThisCall as any);
    return () => {
      off("call:accepted", stopForThisCall as any);
      off("call:answered", stopForThisCall as any);
      off("call:rejected", stopForThisCall as any);
      off("call:ended", stopForThisCall as any);
      off("call:timeout", stopForThisCall as any);
    };
  }, [on, off]);

  useEffect(() => {
    return () => {
      try { activeCallRingbackRef.current?.stop(); } catch {}
      try { AudioUtils.stopAllRingtones(); } catch {}
    };
  }, []);

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

  // ==========================================
  // Call Handlers
  // ==========================================
  const stopActiveRingback = useCallback(() => {
    const current = activeCallRingbackRef.current;
    if (current) {
      try { current.stop(); } catch {}
      setActiveCallRingback(null);
    }
    AudioUtils.stopAllRingtones();
  }, []);

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!selectedConversation || startingCall) return;
    const conv = selectedConversation as ConversationView;

    setStartingCall(true);
    try {
      const allParticipants = (conv.participants || []) as ChatParticipant[];
      const currentUid = CURRENT_USER_ID();

      const participantIds = allParticipants
        .map(p => getParticipantUserId(p))
        .filter(uid => uid && uid !== currentUid);

      if (participantIds.length === 0) {
        toast({ variant: 'destructive', title: 'No participants', description: 'This conversation has no other members to call.' });
        return;
      }

      const isGroup = conv.type === 'group' || participantIds.length > 1;

      const createdCall = await createCall.mutateAsync({
        type,
        isGroupCall: isGroup,
        maxParticipants: Math.max(10, participantIds.length + 1),
        waitingRoomEnabled: isGroup,
        recordingEnabled: false,
        participantIds,
        // Link the call to this conversation so the backend posts a
        // call-log message into the chat when the call ends.
        conversation_id: conv.id,
        conversationId: conv.id,
      } as any);

      const callId = createdCall.id;
      const callCode = (createdCall as any)?.callCode || (createdCall as any)?.call_code || callId;
      const roomId = callCode;

      // NOTE: the backend already emits `call:incoming` to every invitee inside
      // POST /calls — emitting call:invite from the client as well caused each
      // callee to ring multiple times. Do NOT re-invite here.

      // Host ringback until someone answers
      try {
        const rbStop = await AudioUtils.playRingback();
        setActiveCallRingback({ callId, stop: rbStop });
      } catch {}

      // Navigate host to call room
      navigate(
        `/calls?roomId=${encodeURIComponent(roomId)}&autoJoin=1&isHost=true&callType=${type}&callId=${encodeURIComponent(callId)}&callCode=${encodeURIComponent(callCode)}`
      );
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to start call',
        description: getApiMessage(err, 'Could not start call. Please try again.'),
      });
      stopActiveRingback();
    } finally {
      setStartingCall(false);
    }
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

  // ==========================================
  // Outgoing messages (text, stickers, GIFs, attachments)
  // ==========================================

  /** Shared optimistic-send pipeline. `onFailure: "keep"` marks the bubble
   *  failed (retryable text); "remove" drops it entirely (attachments). */
  const dispatchOptimisticMessage = useCallback(
    async (data: SendMessageInput, optimisticExtras: Partial<ChatMessage>, onFailure: "keep" | "remove" = "keep") => {
      if (!selectedConversation) return;
      const convId = selectedConversation.id;
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const optimisticMsg: ChatMessage = {
        id: tempId,
        conversationId: convId,
        conversation_id: convId,
        senderId: CURRENT_USER_ID(),
        sender_id: CURRENT_USER_ID(),
        senderName: CURRENT_USER_NAME(),
        sender_name: CURRENT_USER_NAME(),
        content: data.content ?? "",
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        status: "sending",
        isOptimistic: true,
        ...optimisticExtras,
      };

      setLocalMessages((prev) => [...prev, optimisticMsg]);
      pendingMessageIdsRef.current.add(tempId);
      scrollToBottom(true);
      try { AudioUtils.playMessageSent(); } catch {}

      try {
        const result = await sendMessage.mutateAsync({ conversationId: convId, data });
        const realId = (result as any)?.id || (result as any)?.messageId || tempId;
        pendingMessageIdsRef.current.delete(tempId);
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...(result as any),
                  id: realId,
                  status: "sent",
                  isOptimistic: false,
                  conversationId: convId,
                  conversation_id: convId,
                  senderId: CURRENT_USER_ID(),
                  sender_id: CURRENT_USER_ID(),
                  senderName: CURRENT_USER_NAME(),
                  sender_name: CURRENT_USER_NAME(),
                  content: (result as any)?.content ?? data.content ?? "",
                  createdAt: (result as any)?.createdAt || (result as any)?.created_at || new Date().toISOString(),
                  created_at: (result as any)?.created_at || (result as any)?.createdAt || new Date().toISOString(),
                }
              : m
          )
        );
        refetchConv();
      } catch (err) {
        pendingMessageIdsRef.current.delete(tempId);
        setLocalMessages((prev) =>
          onFailure === "remove"
            ? prev.filter((m) => m.id !== tempId)
            : prev.map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m))
        );
        toast({ variant: "destructive", title: "Error", description: getApiMessage(err, "Failed to send message") });
      }
    },
    [selectedConversation, sendMessage, refetchConv, toast, scrollToBottom]
  );

  const handleSendMessage = async () => {
    if (!selectedConversation || !newMessage.trim()) return;
    const content = newMessage.trim();
    setNewMessage("");
    emitTypingStatus(false);
    await dispatchOptimisticMessage({ content }, {}, "keep");
  };

  /** Instant-send emoji from the picker (WhatsApp behavior: sends as-is). */
  const handlePanelEmojiSend = useCallback(
    async (emoji: string) => {
      if (!selectedConversation || !emoji) return;
      setPickerOpen(false);
      await dispatchOptimisticMessage({ content: emoji }, {}, "remove");
    },
    [selectedConversation, dispatchOptimisticMessage]
  );

  /** Instant-send big-emoji sticker (messageType='sticker', rendered ~96px). */
  const handleSendSticker = useCallback(
    async (emoji: string) => {
      if (!selectedConversation) return;
      setPickerOpen(false);
      await dispatchOptimisticMessage(
        { content: emoji, messageType: "sticker", attachmentType: "sticker" },
        { content: emoji, messageType: "sticker", attachmentType: "sticker" },
        "remove"
      );
    },
    [selectedConversation, dispatchOptimisticMessage]
  );

  /** Send a picked GIF as an attachment message. */
  const handleSendGif = useCallback(
    async (gif: GifObject) => {
      if (!selectedConversation || !gif?.url) return;
      setPickerOpen(false);
      const gifName = gif.description || "GIF";
      await dispatchOptimisticMessage(
        {
          content: "",
          attachmentUrl: gif.url,
          attachmentType: "gif",
          attachmentName: gifName,
          messageType: "gif",
        },
        { attachmentUrl: gif.url, attachmentType: "gif", messageType: "gif", attachmentName: gifName },
        "remove"
      );
    },
    [selectedConversation, dispatchOptimisticMessage]
  );

  // ==========================================
  // File attachments (photos / videos / documents)
  // ==========================================

  /** WhatsApp-style attachment upload: optimistic bubble -> POST /chat/media
   *  -> send message with attachment metadata. Text already typed in the
   *  composer is used as the caption. */
  const handleFileSelected = useCallback(
    async (file?: File | null) => {
      if (!file || !selectedConversation) return;
      if (file.size > CHAT_MEDIA_MAX_BYTES) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: `“${file.name}” is ${formatFileSize(file.size)} — attachments are limited to 100 MB.`,
        });
        return;
      }

      const kind = guessMediaKind(file);
      const convId = selectedConversation.id;
      const caption = newMessage.trim();
      const isPreviewable = kind === "image" || kind === "video";
      const localPreviewUrl = isPreviewable ? URL.createObjectURL(file) : undefined;

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const optimisticMsg: ChatMessage = {
        id: tempId,
        conversationId: convId,
        conversation_id: convId,
        senderId: CURRENT_USER_ID(),
        sender_id: CURRENT_USER_ID(),
        senderName: CURRENT_USER_NAME(),
        sender_name: CURRENT_USER_NAME(),
        content: "",
        attachmentUrl: localPreviewUrl || "",
        attachmentType: kind,
        attachmentName: file.name,
        attachmentSize: file.size,
        messageType: kind,
        localPreviewUrl,
        uploading: true,
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        status: "sending",
        isOptimistic: true,
      };

      setLocalMessages((prev) => [...prev, optimisticMsg]);
      pendingMessageIdsRef.current.add(tempId);
      setNewMessage("");
      scrollToBottom(true);

      try {
        const media = await uploadChatMedia(file);
        const result = await sendMessage.mutateAsync({
          conversationId: convId,
          data: {
            content: caption || undefined,
            attachmentUrl: media.url,
            attachmentType: media.attachmentType,
            attachmentName: media.name || file.name,
            attachmentSize: media.size ?? file.size,
            messageType: media.attachmentType as MessageTypeName,
          },
        });

        const realId = (result as any)?.id || (result as any)?.messageId || tempId;
        pendingMessageIdsRef.current.delete(tempId);
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...(result as any),
                  id: realId,
                  status: "sent",
                  isOptimistic: false,
                  uploading: false,
                  conversationId: convId,
                  conversation_id: convId,
                  senderId: CURRENT_USER_ID(),
                  sender_id: CURRENT_USER_ID(),
                  senderName: CURRENT_USER_NAME(),
                  sender_name: CURRENT_USER_NAME(),
                  content: (result as any)?.content ?? caption ?? "",
                  attachmentUrl: (result as any)?.attachmentUrl || media.url,
                  attachment_url: (result as any)?.attachment_url || media.url,
                  attachmentType: (result as any)?.attachmentType || media.attachmentType,
                  attachment_type: (result as any)?.attachment_type || media.attachmentType,
                  attachmentName: (result as any)?.attachmentName || media.name || file.name,
                  attachment_name: (result as any)?.attachment_name || media.name || file.name,
                  attachmentSize: (result as any)?.attachmentSize ?? media.size ?? file.size,
                  attachment_size: (result as any)?.attachment_size ?? media.size ?? file.size,
                  messageType: (result as any)?.messageType || media.attachmentType,
                  message_type: (result as any)?.message_type || media.attachmentType,
                  createdAt: (result as any)?.createdAt || (result as any)?.created_at || new Date().toISOString(),
                  created_at: (result as any)?.created_at || (result as any)?.createdAt || new Date().toISOString(),
                }
              : m
          )
        );
        refetchConv();
        try { AudioUtils.playMessageSent(); } catch {}
      } catch (err) {
        pendingMessageIdsRef.current.delete(tempId);
        setLocalMessages((prev) => prev.filter((m) => m.id !== tempId));
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: getApiMessage(err, "Could not upload the attachment. Please try again."),
        });
      } finally {
        if (localPreviewUrl) window.setTimeout(() => URL.revokeObjectURL(localPreviewUrl), 5_000);
      }
    },
    [selectedConversation, newMessage, sendMessage, refetchConv, toast, scrollToBottom]
  );

  const handleMediaInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    handleFileSelected(file);
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

  // Voice notes: upload the recorded audio, then send it as an attachment.
  // An optimistic bubble shows the “🎤 Voice note” placeholder until the real
  // message (with attachmentUrl) replaces it and renders the audio player.
  const handleSendVoiceNote = async (file: File) => {
    if (!selectedConversation || voiceUploading) return;
    const convId = selectedConversation.id;
    setIsRecording(false);

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversationId: convId,
      conversation_id: convId,
      senderId: CURRENT_USER_ID(),
      sender_id: CURRENT_USER_ID(),
      senderName: CURRENT_USER_NAME(),
      sender_name: CURRENT_USER_NAME(),
      content: "🎤 Voice note",
      createdAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
      status: "sending",
      isOptimistic: true,
    };

    setLocalMessages((prev) => [...prev, optimisticMsg]);
    pendingMessageIdsRef.current.add(tempId);
    scrollToBottom(true);
    setVoiceUploading(true);

    try {
      const media = await uploadChatMedia(file);
      const result = await sendMessage.mutateAsync({
        conversationId: convId,
        data: {
          content: "🎤 Voice note",
          attachmentUrl: media.url,
          attachmentType: "audio",
          attachmentName: file.name || "Voice note.webm",
          attachmentSize: file.size,
          messageType: "voice",
        },
      });

      const realId = (result as any)?.id || (result as any)?.messageId || tempId;
      pendingMessageIdsRef.current.delete(tempId);
      setLocalMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...(result as any),
                id: realId,
                status: "sent",
                isOptimistic: false,
                conversationId: convId,
                conversation_id: convId,
                senderId: CURRENT_USER_ID(),
                sender_id: CURRENT_USER_ID(),
                senderName: CURRENT_USER_NAME(),
                sender_name: CURRENT_USER_NAME(),
                content: (result as any)?.content || "🎤 Voice note",
                attachmentUrl: (result as any)?.attachmentUrl || media.url,
                attachment_url: (result as any)?.attachment_url || media.url,
                attachmentType: (result as any)?.attachmentType || "audio",
                attachment_type: (result as any)?.attachment_type || "audio",
                attachmentName: (result as any)?.attachmentName || file.name || "Voice note.webm",
                attachment_name: (result as any)?.attachment_name || file.name || "Voice note.webm",
                attachmentSize: (result as any)?.attachmentSize ?? file.size,
                attachment_size: (result as any)?.attachment_size ?? file.size,
                messageType: (result as any)?.messageType || "voice",
                message_type: (result as any)?.message_type || "voice",
                createdAt: (result as any)?.createdAt || (result as any)?.created_at || new Date().toISOString(),
                created_at: (result as any)?.created_at || (result as any)?.createdAt || new Date().toISOString(),
              }
            : m
        )
      );
      refetchConv();
      try { AudioUtils.playMessageSent(); } catch {}
    } catch (err) {
      pendingMessageIdsRef.current.delete(tempId);
      setLocalMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
      toast({ variant: "destructive", title: "Error", description: getApiMessage(err, "Failed to send voice note") });
    } finally {
      setVoiceUploading(false);
    }
  };

  const isTyping = Object.keys(typingUsers).length > 0;
  const hasInputContent = !!newMessage.trim();

  // ==========================================
  // Profile modal helpers
  // ==========================================
  const focusComposer = useCallback(() => {
    // Wait for the modal to unmount so focus is not stolen back.
    window.setTimeout(() => composerRef.current?.focus(), 80);
  }, []);

  /** Participant lookup table for the open conversation (avatar/email/...). */
  const participantById = useMemo(() => {
    const map = new Map<string, ChatParticipant>();
    ((selectedConversation as ConversationView | null)?.participants as ChatParticipant[] | undefined)?.forEach((p) => {
      const uid = getParticipantUserId(p);
      if (uid) map.set(uid, p);
    });
    return map;
  }, [selectedConversation]);

  const buildPerson = useCallback(
    (userId: string, fallbackName: string): ChatProfilePerson => {
      const p = participantById.get(userId);
      const member = teamMembers.find((m) => m.id === userId);
      return {
        userId,
        name: getParticipantName(teamMembers, userId, p) || fallbackName,
        email: p?.email ?? member?.email ?? null,
        avatarUrl: p?.avatarUrl ?? null,
        role: member?.role ?? null,
        lastSeen: getParticipantLastSeen(p),
      };
    },
    [participantById, teamMembers]
  );

  const openConversationProfile = useCallback(() => {
    const conv = selectedConversation as ConversationView | null;
    if (!conv) return;
    setProfileIsGroup(conv.type === "group");
    if (conv.type !== "group") {
      const p = getDirectParticipant(conv);
      const uid = getParticipantUserId(p);
      const person = buildPerson(uid, getParticipantName(teamMembers, uid, p));
      setProfilePerson(person);
    } else {
      setProfilePerson(null);
    }
    setProfileModalOpen(true);
  }, [selectedConversation, buildPerson, teamMembers]);

  const openMessageSenderProfile = useCallback(
    (msg: ChatMessage) => {
      const senderId = getMsgSenderId(msg);
      if (!senderId) return;
      setProfileIsGroup(false);
      setProfilePerson(buildPerson(senderId, getMsgSenderName(teamMembers, msg)));
      setProfileModalOpen(true);
    },
    [buildPerson, teamMembers]
  );

  const getSenderAvatarUrl = useCallback(
    (msg: ChatMessage) => resolveMediaUrl(participantById.get(getMsgSenderId(msg))?.avatarUrl || ""),
    [participantById]
  );

  const profilePresenceLabel = useMemo(() => {
    if (profileIsGroup || !profilePerson) return null;
    const p = participantById.get(profilePerson.userId);
    return getParticipantStatusLine(p, userPresence[profilePerson.userId]).line;
  }, [profileIsGroup, profilePerson, participantById, userPresence]);

  // ==========================================
  // Render
  // ==========================================
  return (
    <Layout>
      <div className="flex flex-col h-[calc(100dvh-118px)] sm:h-[calc(100dvh-78px)] min-h-[420px]">
        {/* Page header — compact on mobile, hidden while inside a conversation */}
        <div className={cn("items-center justify-between mb-3 shrink-0", mobileShowSidebar || !selectedConversation ? "flex" : "hidden sm:flex")}>
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">Chat</h1>
              <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">Communicate with your team</p>
            </div>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <Button className="rounded-xl shadow-sm" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />New Chat
            </Button>
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
        <div className="flex flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm">
          {/* Sidebar */}
          <div className={cn("w-full sm:w-[340px] border-r border-border flex-col shrink-0 bg-card", mobileShowSidebar ? "flex" : "hidden sm:flex")}>
            <div className="p-3 border-b border-border/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-foreground">Messages</h2>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {sortedConversations.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="metric-ai-glow h-8 w-8 rounded-lg bg-gradient-to-br from-[#4F46E5] to-[#2563EB] text-white shadow-sm hover:from-[#4338CA] hover:to-[#1D4ED8] hover:text-white"
                    title="MetricAi — your AI assistant"
                    aria-label="Open MetricAi assistant"
                    onClick={() => navigate("/metric-ai")}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm hover:from-blue-700 hover:to-violet-700 hover:text-white"
                    title="New conversation"
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 bg-muted/50 rounded-xl border-border/70"
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
                <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="p-2 space-y-1">
                  {/* Pinned MetricAi entry (special assistant, not a real conversation) */}
                  <button
                    type="button"
                    onClick={() => navigate("/metric-ai")}
                    aria-label="Open MetricAi assistant"
                    className="w-full px-3 py-2.5 mx-0 text-left transition-all duration-150 rounded-xl border border-transparent hover:bg-muted/70"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <span className="metric-ai-glow flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#4F46E5] to-[#2563EB] ring-1 ring-indigo-500/40">
                          <img src="/Assets/logo.png" alt="" className="h-8 w-8 rounded-full object-cover" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">MetricAi</p>
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500/80" />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">Your AI assistant</p>
                      </div>
                    </div>
                  </button>
                  {sortedConversations.length > 0 ? (
                    sortedConversations.map((conv) => (
                      <ConversationListItem
                        key={conv.id}
                        conversation={conv}
                        isSelected={selectedConversation?.id === conv.id}
                        members={teamMembers}
                        presence={userPresence}
                        searchQuery={searchQuery}
                        onClick={() => {
                          setSelectedConversation(conv);
                          // Mobile: enter the conversation immediately.
                          setMobileShowSidebar(false);
                        }}
                      />
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center p-10 text-center">
                      <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                        <MessageSquare className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                      <p className="text-sm font-medium text-foreground/80">{searchQuery ? "No matching conversations" : "No conversations yet"}</p>
                      {!searchQuery && (
                        <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => setIsCreateDialogOpen(true)}>
                          <Plus className="h-3.5 w-3.5 mr-1.5" />Start one
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Chat Area */}
          <div className={cn("flex-1 flex flex-col min-w-0", mobileShowSidebar && "hidden sm:flex")}>
            {selectedConversation ? (
              <>
                {/* Chat Header */}
                <div className="px-3 sm:px-4 py-2.5 border-b border-border/70 flex items-center justify-between gap-2 bg-card/80 backdrop-blur-md shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden shrink-0" onClick={() => setMobileShowSidebar(true)}>
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    {(() => {
                      const convView = selectedConversation as ConversationView;
                      const convName = getConversationName(teamMembers, convView);
                      const avatarUrl = getConversationAvatarUrl(convView);
                      const directP = convView.type === "direct" ? getDirectParticipant(convView) : undefined;
                      const directPid = convView.type === "direct" ? getParticipantUserId(directP) : "";
                      const statusInfo = directP
                        ? getParticipantStatusLine(directP, userPresence[directPid])
                        : null;
                      const headerDotColor = statusInfo
                        ? statusInfo.isOnlineDot
                          ? getPresenceColor(userPresence[directPid])
                          : "bg-gray-400"
                        : undefined;
                      return (
                        <button
                          type="button"
                          onClick={openConversationProfile}
                          aria-label="View profile"
                          title="View profile"
                          className="flex items-center gap-2.5 min-w-0 text-left rounded-xl px-1 py-0.5 -mx-1 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-blue-500/40"
                        >
                          <div className="relative shrink-0">
                            <Avatar className="h-10 w-10">
                              {avatarUrl && <AvatarImage src={avatarUrl} alt={convName} />}
                              <AvatarFallback className={cn("bg-gradient-to-br text-white font-semibold text-xs shadow-sm", getAvatarGradient(convName))}>
                                {getInitials(convName)}
                              </AvatarFallback>
                            </Avatar>
                            {convView.type === "direct" && headerDotColor && (
                              <span className={cn("absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-card", headerDotColor)} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm truncate text-foreground">{convName}</h3>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {convView.type === "direct"
                                ? statusInfo?.line ?? "Offline"
                                : `${convView.participants.length} members`}
                            </p>
                          </div>
                        </button>
                      );
                    })()}
                  </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl shrink-0 hover:bg-emerald-500/10 hover:text-emerald-500"
                    title="Start audio call"
                    disabled={startingCall}
                    onClick={() => handleStartCall('audio')}
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl shrink-0 hover:bg-blue-500/10 hover:text-blue-500"
                    title="Start video call"
                    disabled={startingCall}
                    onClick={() => handleStartCall('video')}
                  >
                    <Video className="h-4 w-4" />
                  </Button>
                  {startingCall && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-0.5" />}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={openConversationProfile}>
                        <Users className="h-4 w-4 mr-2" />View Members
                      </DropdownMenuItem>
                      <DropdownMenuItem><Search className="h-4 w-4 mr-2" />Search in Chat</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600">Mute Conversation</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                </div>

                {/* Messages */}
                <div
                  ref={scrollContainerRef}
                  onScroll={handleScroll}
                  className="flex-1 overflow-y-auto px-2.5 sm:px-6 py-4 space-y-1"
                  style={{
                    backgroundImage: "radial-gradient(rgba(127,127,127,0.13) 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                  }}
                >
                  {groupedMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-blue-500/15 to-violet-500/15 flex items-center justify-center mb-4 rotate-3">
                        <MessageSquare className="h-9 w-9 text-blue-500/60" />
                      </div>
                      <p className="font-semibold text-foreground/80">No messages yet</p>
                      <p className="text-sm text-muted-foreground/80 mt-1">Say hello — send the first message</p>
                    </div>
                  ) : (
                    groupedMessages.map((item, idx) => {
                      if (item.type === "date") return <DateSeparator key={`date-${idx}`} date={item.data as string} />;
                      const msg = item.data as ChatMessage;
                      const isOwn = getMsgSenderId(msg) === CURRENT_USER_ID();
                      // System call summaries render as a slim centered log row (no bubble)
                      if (getMessageType(msg) === "call-log") {
                        return (
                          <CallLogRow
                            key={msg.id}
                            content={msg.content}
                            createdAt={getMsgTime(msg)}
                            isOwn={isOwn}
                          />
                        );
                      }
                      return (
                        <MessageBubble
                          key={msg.id}
                          message={msg}
                          isOwn={isOwn}
                          isGrouped={!!item.isGrouped}
                          showSender={!!item.showSender}
                          senderName={item.senderName || ""}
                          senderAvatarUrl={getSenderAvatarUrl(msg)}
                          onSenderClick={() => openMessageSenderProfile(msg)}
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
                <div className="p-3 sm:p-4 border-t border-border/70 bg-card/80 backdrop-blur-md shrink-0">
                  {/* Emoji | Stickers | GIF picker — attaches above the composer */}
                  {pickerOpen && !isRecording && (
                    <div className="flex justify-start">
                      <StickerEmojiGifPanel
                        onEmojiSelect={handlePanelEmojiSend}
                        onStickerSelect={handleSendSticker}
                        onGifSelect={handleSendGif}
                      />
                    </div>
                  )}
                  {isRecording ? (
                    <VoiceRecorderPill
                      onSend={handleSendVoiceNote}
                      onCancel={() => setIsRecording(false)}
                      onError={(msg) =>
                        toast({ variant: "destructive", title: "Voice note", description: msg })
                      }
                    />
                  ) : (
                    <div className="flex items-end gap-2">
                      {/* Attach menu (WhatsApp-style paperclip) */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
                            title="Attach a file"
                            aria-label="Attach a file"
                          >
                            <Paperclip className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="top" sideOffset={8}>
                          <DropdownMenuItem onClick={() => mediaInputRef.current?.click()}>
                            <ImageIcon className="h-4 w-4 mr-2" />Photo or Video
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => docInputRef.current?.click()}>
                            <FileText className="h-4 w-4 mr-2" />Document
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <div className="flex-1 flex items-end bg-muted/60 border border-border/80 rounded-2xl px-3 py-1.5 focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                        <Textarea
                          ref={composerRef}
                          placeholder="Type a message..."
                          value={newMessage}
                          onChange={(e) => handleInputChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                          className="flex-1 min-h-[36px] max-h-[128px] resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 py-1.5 px-0 text-sm"
                          rows={1}
                        />
                        <div className="flex items-center gap-1 shrink-0 mb-0.5">
                          {!hasInputContent && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent",
                                pickerOpen && "bg-accent text-foreground"
                              )}
                              onClick={() => setPickerOpen((prev) => !prev)}
                              title="Emoji, stickers and GIFs"
                              aria-label="Open emoji, sticker and GIF picker"
                              aria-expanded={pickerOpen}
                            >
                              <Smile className="h-4 w-4" />
                            </Button>
                          )}
                          {!hasInputContent && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent"
                              onClick={() => {
                                setPickerOpen(false);
                                setIsRecording(true);
                              }}
                              disabled={voiceUploading}
                              title="Record voice note"
                              aria-label="Record voice note"
                            >
                              <Mic className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            onClick={handleSendMessage}
                            disabled={!hasInputContent}
                            size="icon"
                            className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 shadow-sm shadow-blue-600/30 disabled:opacity-30 shrink-0"
                            title="Send message"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Hidden attachment inputs (must stay mounted) */}
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleMediaInputChange}
                  />
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                    className="hidden"
                    onChange={handleMediaInputChange}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-blue-500/5 to-violet-500/5 p-8">
                {mobileShowSidebar ? null : (
                  <>
                    <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-blue-500/15 to-violet-500/15 flex items-center justify-center mb-5 rotate-3">
                      <MessageSquare className="h-11 w-11 text-blue-500/50" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground/90">Select a conversation</h3>
                    <p className="text-sm text-muted-foreground/80 mt-1 text-center">Choose a conversation or start a new one</p>
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

      {/* Profile view modal (direct partner / group + members) */}
      <ChatProfileModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        person={profilePerson}
        isGroup={profileIsGroup}
        groupName={
          profileIsGroup
            ? getConversationName(teamMembers, selectedConversation as ConversationView)
            : null
        }
        groupAvatarUrl={
          profileIsGroup
            ? getConversationAvatarUrl(selectedConversation as ConversationView)
            : null
        }
        members={
          profileIsGroup
            ? ((selectedConversation as ConversationView | null)?.participants as ChatParticipant[] | undefined)?.map((p) =>
                buildPerson(getParticipantUserId(p), getParticipantName(teamMembers, getParticipantUserId(p), p))
              )
            : undefined
        }
        presenceLabel={profilePresenceLabel}
        onMessage={focusComposer}
      />
    </Layout>
  );
}