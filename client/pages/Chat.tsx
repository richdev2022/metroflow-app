import { useState, useEffect, useRef, useMemo, useCallback, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  MoreHorizontal,
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
  CornerUpLeft,
  Copy,
  Pencil,
  Trash2,
  Ban,
  UserCheck,
  PencilLine,
  Reply,
  Forward,
  CheckSquare,
  Square,
  Languages,
  Bold,
  Italic,
  Strikethrough,
  Code2,
  Download,
  ListChecks,
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
import { startCall } from "@/lib/active-call";
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
import { formatLastSeen, isRecent, parseDateSafe } from "@/lib/last-seen";
import { VoiceNotePlayer } from "@/components/chat/VoiceNotePlayer";
import { VoiceRecorderPill } from "@/components/chat/VoiceRecorderPill";
import { ChatProfileModal, ChatProfilePerson } from "@/components/chat/ChatProfileModal";
import { GroupInfoSheet } from "@/components/chat/GroupInfoSheet";
import { MessageActionMenu } from "@/components/chat/MessageActionMenu";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  ImageAttachment,
  VideoAttachment,
  DocumentAttachment,
  StickerAttachment,
} from "@/components/chat/AttachmentMedia";
import { StickerEmojiGifPanel } from "@/components/chat/StickerEmojiGifPanel";
import { CallLogRow } from "@/components/chat/CallLogRow";
import { CallSummarySheet } from "@/components/chat/CallSummarySheet";
import {
  CHAT_MEDIA_MAX_BYTES,
  formatFileSize,
  isSoloEmojiMessage,
  guessMediaKind,
  parseCallLogContent,
  downloadChatAttachment,
} from "@/lib/chat-media";
import type { ChatCallLogMeta, GifObject, MessageReplySnapshot } from "@shared/api";
import { renderStyledText, wrapSelectionWithMarker } from "@/components/chat/styled-text";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { getMetricAiStatus } from "@/lib/metric-ai";

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

export type ChatMessage = {
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
  /** Present when the message body was edited. */
  editedAt?: string | null;
  edited_at?: string | null;
  /** Tombstones (DELETE ?scope=everyone|me). */
  deletedForEveryone?: boolean | null;
  deleted_for_everyone?: boolean | null;
  deletedForMe?: boolean | null;
  deleted_for_me?: boolean | null;
  /** Quoted-parent snapshot (replies). */
  replyTo?: MessageReplySnapshot | null;
  reply_to?: MessageReplySnapshot | null;
 /** WhatsApp-style "Forwarded" label (multi-select forward flow). */
  forwarded?: boolean | null;
  /** Ephemeral system rows ("X left the group") — socket-driven, not persisted. */
  system?: boolean;
  /** Local blob URL for optimistic image/video previews while uploading. */
  localPreviewUrl?: string;
  /** True while the attachment file is still uploading to /chat/media. */
  uploading?: boolean;
  status?: "sending" | "sent" | "failed" | "read";
  isOptimistic?: boolean;
};

export type ConversationView = Conversation & {
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
  /** Batch-4 presence / block / role helpers from the conversations payload. */
  otherUserLastSeenAt?: string | null;
  other_user_last_seen_at?: string | null;
  otherUserPresenceStatus?: string | null;
  other_user_presence_status?: string | null;
  blockedByMe?: boolean | null;
  blocked_by_me?: boolean | null;
  blockedMe?: boolean | null;
  blocked_me?: boolean | null;
  myRole?: string | null;
  my_role?: string | null;
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

const getDirectParticipant = (conv?: ConversationView | null) => {
  const uid = CURRENT_USER_ID();
  const list = ((conv?.participants ?? []) as ChatParticipant[]);
  return list.find((p) => getParticipantUserId(p) !== uid) || list[0];
};

const getConversationName = (members: TeamMember[], conv?: ConversationView | null): string => {
  // Backend-provided display name wins: direct chats already resolve to the
  // OTHER participant's name, groups to the group name.
  // Null-safe on purpose: sheet/modal props below are computed on EVERY render
  // even while no conversation is selected — passing null here used to crash
  // the whole chat page with "Cannot read properties of null (reading
  // 'displayName')" on entry.
  if (!conv) return "";
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
const getConversationAvatarUrl = (conv?: ConversationView | null) => {
  const raw =
    conv?.displayAvatarUrl ||
    (conv?.type === "direct" ? getDirectParticipant(conv)?.avatarUrl : null) ||
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
  socketPresence: string | undefined,
  lastSeenOverride?: string | null,
): { line: string; isOnlineDot: boolean } => {
  const presenceStatus = socketPresence;
  const activeStatuses = ["online", "busy", "in-meeting", "calling", "do-not-disturb"];
  const isActivePresence = !!presenceStatus && activeStatuses.includes(presenceStatus);
  // otherUserLastSeenAt (conversation payload) wins over the participant row's
  // lastSeen — the latter can lag behind (that plus UTC parsing bugs was the
  // reported "last seen is wrong" issue).
  const lastSeen = lastSeenOverride ?? getParticipantLastSeen(participant);

  if (isActivePresence) {
    return { line: getPresenceLabel(presenceStatus), isOnlineDot: true };
  }

  if (isRecent(lastSeen)) {
    return { line: "Online", isOnlineDot: true };
  }

  const formatted = formatLastSeen(lastSeen);
  if (formatted) {
    return { line: `last seen ${formatted}`, isOnlineDot: false };
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

const getMsgEditedAt = (m: ChatMessage) => m.editedAt || m.edited_at || null;
const isDeletedForMe = (m: ChatMessage) => !!(m.deletedForMe ?? m.deleted_for_me);
const isDeletedForEveryone = (m: ChatMessage) => !!(m.deletedForEveryone ?? m.deleted_for_everyone);
const getMsgReplyTo = (m: ChatMessage): MessageReplySnapshot | null =>
  m.replyTo ?? m.reply_to ?? null;

/** Short preview for a quoted block (emoji-prefixed for attachments). */
const quotedSnippet = (q: MessageReplySnapshot | null | undefined): string => {
  if (!q) return "";
  const t = (q.messageType || "").toLowerCase();
  const at = (q.attachmentType || "").toLowerCase();
  if (t === "image" || at === "image") return q.content ? `📷 ${q.content}` : "📷 Photo";
  if (t === "video" || at === "video") return q.content ? `🎬 ${q.content}` : "🎬 Video";
  if (t === "voice" || t === "audio" || at === "audio") return "🎤 Voice note";
  if (t === "gif" || at === "gif") return q.content ? `GIF · ${q.content}` : "GIF";
  if (t === "sticker" || at === "sticker") return "Sticker";
  if (t === "document" || at === "document") return `📎 ${q.content || "Document"}`;
  return q.content || "";
};

/** Whether the current user may inline-edit this message (own, text, <24h). */
const canEditMessage = (m: ChatMessage): boolean => {
  if (getMsgSenderId(m) !== CURRENT_USER_ID()) return false;
  if (isCallLogMessage(m) || isDeletedForMe(m) || isDeletedForEveryone(m)) return false;
  if (getAttachmentUrl(m)) return false;
  const type = getMessageType(m);
  if (type && type !== "text") return false;
  const created = parseDateSafe(getMsgTime(m));
  if (!created) return false;
  return Date.now() - created.getTime() <= 24 * 60 * 60 * 1000;
};

/**
 * Robust call-log detection. The messageType flag is the primary signal, but
 * older rows / snake_case payloads / edit-tombstones may lose it, so the
 * content JSON itself (callType+status keys) is accepted as a fallback —
 * this is why call logs "didn't show" for some rows.
 */
const isCallLogMessage = (m: ChatMessage): boolean =>
  getMessageType(m) === "call-log" || !!parseCallLogContent(m.content);

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

/** Subtle centered system row ("X left the group") — socket-driven, ephemeral. */
const SystemRow = ({ content }: { content: string }) => (
  <div className="flex justify-center py-1.5">
    <span className="max-w-[86%] truncate rounded-full bg-muted/60 px-3 py-1 text-[11px] italic text-muted-foreground border border-border/50">
      {content}
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
  highlighted,
  onQuoteClick,
  onOpenMenu,
  onReplySwipe,
  translatedText,
  selectionActive,
  selected,
  onToggleSelect,
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
  /** Flash-highlight (quote jump). */
  highlighted?: boolean;
  /** Scroll the quoted original into view. */
  onQuoteClick?: (quotedId: string) => void;
  /** Open the message action menu (hover button / long-press / right-click). */
  onOpenMenu?: (message: ChatMessage, x: number, y: number) => void;
  /** Swipe-to-reply (touch). */
  onReplySwipe?: (message: ChatMessage) => void;
  /** MetricAi translation shown under the message body. */
  translatedText?: string;
  /** Multi-select mode active (bubble click toggles selection). */
  selectionActive?: boolean;
  /** This bubble is currently ticked in selection mode. */
  selected?: boolean;
  /** Toggle this message's selected state. */
  onToggleSelect?: (id: string) => void;
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
  const deletedForMe = isDeletedForMe(message);
  const deletedForEveryone = isDeletedForEveryone(message);
  const tombstone = deletedForMe || deletedForEveryone;
  const replyTo = getMsgReplyTo(message);

  // ----- Swipe-to-reply (touch) -----
  const [swipeX, setSwipeX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; lastX: number; lastY: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPointRef = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY, lastX: t.clientX, lastY: t.clientY };
    longPressPointRef.current = { x: t.clientX, y: t.clientY };
    setDragging(true);
    clearLongPress();
    if (onOpenMenu && !tombstone) {
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        // Haptic tick on menu open (best-effort).
        try { navigator.vibrate?.(12); } catch {}
        const pt = longPressPointRef.current;
        if (pt) onOpenMenu(message, pt.x, pt.y);
      }, 500);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    const t = e.touches[0];
    if (!start || !t) return;
    start.lastX = t.clientX;
    start.lastY = t.clientY;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Vertical scroll or left drag cancels both gestures.
    if (Math.abs(dy) > Math.abs(dx) || dx <= 0) {
      clearLongPress();
      if (swipeX !== 0) setSwipeX(0);
      return;
    }
    if (dx > 10) clearLongPress();
    setSwipeX(Math.min(dx, 96));
  };

  const handleTouchEnd = () => {
    clearLongPress();
    if (swipeX > 56 && onReplySwipe && !tombstone) {
      try { navigator.vibrate?.(10); } catch {}
      onReplySwipe(message);
    }
    setSwipeX(0);
    setDragging(false);
    touchStartRef.current = null;
  };

  useEffect(() => clearLongPress, []);

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
      {getMsgEditedAt(message) && !tombstone && (
        <span className="text-[10px] italic opacity-60" title="Edited">
          edited
        </span>
      )}
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
      <div
        className={cn(
          "flex items-end gap-2 group",
          isOwn ? "justify-end" : "justify-start",
          isGrouped ? "mt-0.5" : "mt-2",
          selectionActive && "cursor-pointer"
        )}
        onClick={selectionActive && onToggleSelect ? (e) => { e.stopPropagation(); onToggleSelect(message.id); } : undefined}
      >
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
        {selectionActive && (
          <span
            className={cn(
              "mb-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
              selected ? "border-blue-500 bg-blue-500 text-white" : "border-border bg-background/80"
            )}
            aria-hidden
          >
            {selected && <Check className="h-3 w-3" />}
          </span>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------
  // Standard bubble rendering (text + media attachments)
  // ------------------------------------------------------------
  const bubbleBase = cn(
    "relative px-3.5 py-2.5 transition-all animate-in fade-in slide-in-from-bottom-1 duration-200 overflow-hidden",
    isOwn
      ? cn(
          "bg-gradient-to-br from-blue-600 via-blue-600 to-violet-600 text-white rounded-2xl rounded-br-md shadow-md shadow-blue-600/15",
          isGrouped && "rounded-br-2xl rounded-tr-md"
        )
      : cn(
          "bg-card text-foreground border border-border/80 rounded-2xl rounded-bl-md shadow-sm",
          isGrouped && "rounded-bl-2xl rounded-tl-md"
        ),
    isFailed && "border-red-500/60 bg-red-50 dark:bg-red-950/30",
    // Quote-jump flash highlight (2s pulse driven by the parent's timeout).
    highlighted && "ring-2 ring-blue-400/70 !bg-blue-500/10 dark:!bg-blue-500/10",
    // Multi-select tick state
    selected && "ring-2 ring-blue-500/80",
    selectionActive && "hover:ring-1 hover:ring-blue-400/40"
  );

  // Quoted-parent block rendered inside the bubble (WhatsApp-style).
  const quotedBlock =
    replyTo && !tombstone ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (replyTo.id) onQuoteClick?.(replyTo.id);
        }}
        className={cn(
          "mb-1.5 flex w-full max-w-full items-stretch gap-2 overflow-hidden rounded-lg px-2 py-1 text-left transition-colors",
          isOwn ? "bg-white/15 hover:bg-white/25" : "bg-muted hover:bg-muted/80"
        )}
        title="Jump to quoted message"
      >
        <span className={cn("w-1 shrink-0 rounded-full", isOwn ? "bg-white/80" : "bg-blue-500")} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[11px] font-semibold", isOwn ? "text-white" : "text-blue-600 dark:text-blue-400")}>
            {replyTo.senderName || "User"}
          </span>
          <span className={cn("block text-[11px] leading-snug line-clamp-2 break-words", isOwn ? "text-white/85" : "text-muted-foreground")}>
            {quotedSnippet(replyTo)}
          </span>
        </span>
      </button>
    ) : null;

  return (
    <div
      className={cn(
        "flex items-end gap-2 group",
        isOwn ? "justify-end" : "justify-start",
        isGrouped ? "mt-0.5" : "mt-2",
        selectionActive && "cursor-pointer"
      )}
      onTouchStart={selectionActive ? undefined : handleTouchStart}
      onTouchMove={selectionActive ? undefined : handleTouchMove}
      onTouchEnd={selectionActive ? undefined : handleTouchEnd}
      onTouchCancel={selectionActive ? undefined : handleTouchEnd}
      onClick={selectionActive && onToggleSelect ? (e) => { e.stopPropagation(); onToggleSelect(message.id); } : undefined}
      onContextMenu={
        onOpenMenu && !tombstone && !selectionActive
          ? (e) => {
              e.preventDefault();
              onOpenMenu(message, e.clientX, e.clientY);
            }
          : undefined
      }
    >
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
      <div className="relative flex min-w-0 max-w-[82%] sm:max-w-[68%] items-center">
        {/* Swipe-to-reply affordance revealed behind the bubble */}
        {onReplySwipe && !tombstone && (
          <span
            className="pointer-events-none absolute left-[-36px] top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"
            style={{ opacity: Math.min(1, swipeX / 56) }}
            aria-hidden
          >
            <CornerUpLeft className="h-3.5 w-3.5" />
          </span>
        )}
        {/* Hover action trigger (desktop) — also opens via long-press/right-click */}
        {onOpenMenu && !tombstone && (
          <button
            type="button"
            className={cn(
              "absolute top-0 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-sm opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 sm:flex",
              isOwn ? "-left-9" : "-right-9"
            )}
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onOpenMenu(message, rect.left + rect.width / 2, rect.bottom + 4);
            }}
            aria-label="Message actions"
            title="Message actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
        {tombstone ? (
          <div
            className={cn(
              "rounded-2xl border border-dashed border-border/70 bg-muted/40 px-3.5 py-2",
              isOwn && "rounded-br-md",
              !isOwn && "rounded-bl-md"
            )}
          >
            <p className="flex items-center gap-1.5 text-[13px] italic text-muted-foreground">
              <Trash2 className="h-3 w-3 shrink-0" />
              {deletedForMe || isOwn ? "You deleted this message" : "This message was deleted"}
            </p>
            <div className="mt-0.5">{timestampRow}</div>
          </div>
        ) : (
          <div
            className={bubbleBase}
            style={{
              transform: `translateX(${swipeX}px)`,
              transition: dragging ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
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

            {quotedBlock}

            {!!message.forwarded && !tombstone && (
              <p className={cn(
                "mb-1 flex items-center gap-1 text-[10.5px] italic",
                isOwn ? "text-white/75" : "text-muted-foreground"
              )}>
                <Forward className="h-3 w-3" /> Forwarded
              </p>
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
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                {renderStyledText(message.content, message.id)}
              </p>
            )}

            {translatedText && (
              <div className={cn(
                "mt-1.5 border-t pt-1.5",
                isOwn ? "border-white/25" : "border-border/70"
              )}>
                <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400">
                  <Languages className="h-3 w-3" /> Translated
                </p>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words opacity-90">
                  {translatedText}
                </p>
              </div>
            )}

            {timestampRow}
          </div>
        )}
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

  // Batch-4: replies, edits, tombstones, blocks, group info, call summaries
  const [messagePatches, setMessagePatches] = useState<Record<string, Partial<ChatMessage>>>({});
  const [systemEvents, setSystemEvents] = useState<ChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<MessageReplySnapshot | null>(null);
  const [editing, setEditing] = useState<{ id: string; original: string } | null>(null);
  const [actionMenu, setActionMenu] = useState<{ message: ChatMessage; x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ message: ChatMessage; scope: "me" | "everyone" } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [callSummaryMeta, setCallSummaryMeta] = useState<ChatCallLogMeta | null>(null);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [lastSeenOverrides, setLastSeenOverrides] = useState<Record<string, string | null>>({});
  const [blockBusy, setBlockBusy] = useState(false);
  // Multi-select mode (WhatsApp-style): forward / bulk copy / bulk delete-for-me
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardBusy, setForwardBusy] = useState(false);

  // MetricAi chat intelligence (translate / smart replies / summarize)
  const [aiAvailable, setAiAvailable] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [smartRepliesLoading, setSmartRepliesLoading] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const [summarizeLoading, setSummarizeLoading] = useState(false);
  const [summarizeText, setSummarizeText] = useState("");

  // Composer formatting toolbar (bold / italic / strike / code)
  const [composerFocused, setComposerFocused] = useState(false);
  // Re-render periodically so relative "last seen" strings stay fresh.
  const [, setPresenceTick] = useState(0);
  const messageElsRef = useRef<Map<string, HTMLElement>>(new Map());

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
    // Per-conversation UI state (batch-4)
    setMessagePatches({});
    setSystemEvents([]);
    setReplyTo(null);
    setEditing(null);
    setActionMenu(null);
    setHighlightedId(null);
    messageElsRef.current.clear();
    // Multi-select + AI state resets with the conversation
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
    setTranslations({});
    setTranslatingId(null);
    setSmartReplies([]);
    setForwardOpen(false);
    setSummarizeOpen(false);
    setSummarizeText("");

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

  // Combine & deduplicate messages (+ apply realtime patches and system rows)
  const combinedMessages = useMemo(() => {
    const apiMsgs = (messagesData?.messages || []) as ChatMessage[];
    const all = [...apiMsgs, ...localMessages, ...systemEvents];
    const seen = new Set<string>();
    return all
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .map((m) => (messagePatches[m.id] ? { ...m, ...messagePatches[m.id] } : m))
      .sort((a, b) => new Date(getMsgTime(a)).getTime() - new Date(getMsgTime(b)).getTime());
  }, [messagesData?.messages, localMessages, systemEvents, messagePatches]);

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

  // Socket: presence:update — live last-seen / presence for header + lists
  useEffect(() => {
    if (!isConnected) return;
    const handler = (payload: { userId?: string; lastSeenAt?: string | null; presenceStatus?: string }) => {
      if (!payload?.userId) return;
      if (payload.lastSeenAt !== undefined) {
        setLastSeenOverrides((p) => ({ ...p, [payload.userId!]: payload.lastSeenAt ?? null }));
      }
      if (payload.presenceStatus !== undefined) {
        setUserPresence((p) => ({ ...p, [payload.userId!]: payload.presenceStatus! }));
      }
    };
    on("presence:update", handler as any);
    return () => off("presence:update", handler as any);
  }, [isConnected, on, off]);

  // Socket: message:updated — edits + delete tombstones (batch-4)
  useEffect(() => {
    if (!isConnected) return;
    const handler = (payload: { conversationId?: string; conversation_id?: string; message?: ChatMessage } | ChatMessage) => {
      const msg = (payload as any)?.message || (payload as ChatMessage);
      const convId = (payload as any)?.conversationId || (payload as any)?.conversation_id || (msg as any)?.conversationId || (msg as any)?.conversation_id;
      if (!msg?.id) return;
      if (convId && selectedConversation?.id && convId !== selectedConversation.id) return;
      // Merge the authoritative payload over the local copy. Works for both
      // API-cached rows and optimistic local rows via messagePatches.
      setMessagePatches((prev) => ({ ...prev, [msg.id]: { ...prev[msg.id], ...msg } }));
    };
    on("message:updated", handler as any);
    return () => off("message:updated", handler as any);
  }, [isConnected, on, off, selectedConversation?.id]);

  // Socket: conversation:participant-left / participant-removed — member list
  // updates + a subtle system row in the message list.
  useEffect(() => {
    if (!isConnected) return;
    const makeHandler = (verb: "left" | "was removed from") =>
      ({ conversationId, userId, userName }: { conversationId: string; userId?: string; userName?: string }) => {
        if (!conversationId || conversationId !== selectedConversation?.id) return;
        const name = userName || "Someone";
        setSystemEvents((prev) => [
          ...prev,
          {
            id: `sys_${conversationId}_${userId || "?"}_${Date.now()}`,
            messageType: "system",
            system: true,
            senderId: userId,
            content: `${name} ${verb} the group`,
            createdAt: new Date().toISOString(),
          } as unknown as ChatMessage,
        ]);
        refetchConv();
      };
    const onLeft = makeHandler("left");
    const onRemoved = makeHandler("was removed from");
    on("conversation:participant-left", onLeft as any);
    on("conversation:participant-removed", onRemoved as any);
    return () => {
      off("conversation:participant-left", onLeft as any);
      off("conversation:participant-removed", onRemoved as any);
    };
  }, [isConnected, on, off, selectedConversation?.id, refetchConv]);

  // Hydrate blocked-user ids (block list powers the composer banner/state).
  useEffect(() => {
    api
      .get("/users/blocked")
      .then((res) => {
        const data = unwrapApiData<any>(res.data, "");
        const list: any[] = Array.isArray(data) ? data : data?.blocked || data?.users || data?.data || [];
        const ids = new Set<string>();
        (Array.isArray(list) ? list : []).forEach((b: any) => {
          const id = b?.userId || b?.user_id || b?.id;
          if (id) ids.add(String(id));
        });
        setBlockedUserIds(ids);
      })
      .catch(() => {});
  }, []);

  // Periodic tick — keeps "last seen today at 7:46 PM" style lines honest.
  useEffect(() => {
    const t = window.setInterval(() => setPresenceTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

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
      // Starting a call is a good moment to offer incoming-call notifications
      // (explicit user gesture — never requested on app load).
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        import("@/lib/push").then(({ requestPermissionAndSubscribe }) => requestPermissionAndSubscribe()).catch(() => {});
      }
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

      // NOTE: the backend already emits `call:incoming` to every invitee inside
      // POST /calls — emitting call:invite from the client as well caused each
      // callee to ring multiple times. Do NOT re-invite here.

      // Host ringback until someone answers
      try {
        const rbStop = await AudioUtils.playRingback();
        setActiveCallRingback({ callId, stop: rbStop });
      } catch {}

      // Launch the room directly from Chat (App-root ActiveCallHost) — the
      // user stays in the conversation; minimizing the call returns here.
      // The host ringback keeps ringing inside the room until someone joins.
      startCall(
        {
          roomId: callCode,
          callId,
          callType: type,
          onLeave: () => {
            stopActiveRingback();
          },
          userName: CURRENT_USER_NAME(),
          isHost: true,
          waitingRoomEnabled: isGroup,
          calling: (createdCall as any)?.calling || null,
          title: conv.name || (type === "video" ? "Video call" : "Audio call"),
          initialParticipants: [],
          inviteDetails: {
            code: callCode,
            password: null,
            waitingRoomEnabled: isGroup,
          },
        },
        type,
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
        // Blocked DMs surface as 403 — show the friendly copy instead of raw API text.
        const isBlockedSend = (err as any)?.response?.status === 403;
        toast({
          variant: "destructive",
          title: "Error",
          description: isBlockedSend
            ? "You can't reply to this contact anymore."
            : getApiMessage(err, "Failed to send message"),
        });
      }
    },
    [selectedConversation, sendMessage, refetchConv, toast, scrollToBottom]
  );

  const handleSendMessage = async () => {
    if (!selectedConversation) return;
    // Inline edit mode: the composer acts as the editor (Save on Enter).
    if (editing) {
      await saveEdit();
      return;
    }
    if (!newMessage.trim()) return;
    const content = newMessage.trim();
    const replySnapshot = replyTo;
    setNewMessage("");
    setReplyTo(null);
    emitTypingStatus(false);
    await dispatchOptimisticMessage(
      { content, replyToId: replySnapshot?.id || undefined },
      replySnapshot ? { replyTo: replySnapshot } : {},
      "keep"
    );
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
        const status = (err as any)?.response?.status;
        toast({
          variant: "destructive",
          title: "Upload failed",
          description:
            status === 413
              ? "The server rejected this file as too large (proxy limit). Try a smaller file."
              : getApiMessage(err, "Could not upload the attachment. Please try again."),
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

  // ==========================================
  // Message actions (reply / copy / edit / delete) — batch-4
  // ==========================================

  /** Focus the composer after the triggering UI settles. */
  const focusComposerInput = useCallback(() => {
    window.setTimeout(() => composerRef.current?.focus(), 80);
  }, []);

  const handleMessageReply = useCallback(
    (message: ChatMessage) => {
      setActionMenu(null);
      setEditing(null);
      setReplyTo({
        id: message.id,
        senderId: getMsgSenderId(message),
        senderName: getMsgSenderName(teamMembers, message),
        content: message.content || "",
        messageType: getMessageType(message) || null,
        attachmentType: getAttachmentType(message) || null,
      });
      focusComposerInput();
    },
    [teamMembers, focusComposerInput]
  );

  const handleMessageCopy = useCallback(
    (message: ChatMessage) => {
      setActionMenu(null);
      try {
        navigator.clipboard.writeText(message.content || "");
        toast({ title: "Copied" });
      } catch {
        toast({ variant: "destructive", title: "Copy failed", description: "Clipboard is unavailable." });
      }
    },
    [toast]
  );

  const handleMessageEdit = useCallback(
    (message: ChatMessage) => {
      setActionMenu(null);
      setReplyTo(null);
      setEditing({ id: message.id, original: message.content || "" });
      setNewMessage(message.content || "");
      focusComposerInput();
    },
    [focusComposerInput]
  );

  const cancelEdit = useCallback(() => {
    setEditing((cur) => {
      if (cur) setNewMessage("");
      return null;
    });
  }, []);

  const applyOptimisticPatch = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessagePatches((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editing || !selectedConversation) return;
    const convId = selectedConversation.id;
    const { id, original } = editing;
    const content = newMessage.trim();
    if (!content || content === original) {
      setEditing(null);
      setNewMessage("");
      return;
    }
    setEditing(null);
    setNewMessage("");
    applyOptimisticPatch(id, { content, editedAt: new Date().toISOString() });
    try {
      const res = await api.patch(`/chat/conversations/${convId}/messages/${id}`, { content });
      const updated = unwrapApiData<any>(res.data, "");
      const serverMsg = updated?.message || updated;
      if (serverMsg?.id) {
        applyOptimisticPatch(id, { ...serverMsg, content: serverMsg.content ?? content });
      }
    } catch (err) {
      // Roll back the optimistic edit.
      applyOptimisticPatch(id, { content: original, editedAt: null });
      toast({
        variant: "destructive",
        title: "Edit failed",
        description: getApiMessage(err, "Could not edit the message. Please try again."),
      });
    }
  }, [editing, selectedConversation, newMessage, applyOptimisticPatch, toast]);

  const handleMessageDelete = useCallback(
    async (message: ChatMessage, scope: "me" | "everyone") => {
      if (!selectedConversation) return;
      const convId = selectedConversation.id;
      const prevPatch = messagePatches[message.id];
      // Optimistic tombstone: blank the body, keep the row + timestamp.
      applyOptimisticPatch(message.id,
        scope === "me"
          ? { deletedForMe: true, content: "", attachmentUrl: "", attachment_url: "", replyTo: null }
          : { deletedForEveryone: true, content: "", attachmentUrl: "", attachment_url: "", replyTo: null }
      );
      try {
        await api.delete(`/chat/conversations/${convId}/messages/${message.id}?scope=${scope}`);
        refetchConv();
      } catch (err) {
        // Roll back on failure.
        setMessagePatches((p) => {
          const next = { ...p };
          if (prevPatch) next[message.id] = prevPatch;
          else delete next[message.id];
          return next;
        });
        toast({
          variant: "destructive",
          title: "Delete failed",
          description: getApiMessage(err, "Could not delete the message. Please try again."),
        });
      }
    },
    [selectedConversation, messagePatches, applyOptimisticPatch, refetchConv, toast]
  );

  const confirmDelete = useCallback(
    (scope: "me" | "everyone") => {
      if (deleteConfirm) {
        handleMessageDelete(deleteConfirm.message, scope);
        setDeleteConfirm(null);
      }
    },
    [deleteConfirm, handleMessageDelete]
  );

  // ==========================================================================
  // MetricAi chat intelligence — availability probe, smart replies, translate,
  // conversation summary. All soft-gated: when the backend reports MetricAi
  // unavailable the UI simply never shows the entry points.
  // ==========================================================================
  useEffect(() => {
    let cancelled = false;
    getMetricAiStatus()
      .then((status) => {
        if (!cancelled) setAiAvailable(!!status?.available);
      })
      .catch(() => {
        if (!cancelled) setAiAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Whether the newest visible message was sent by someone else. */
  const lastIncomingMessageId = useMemo(() => {
    if (!selectedConversation) return null;
    const visible = [...localMessages]
      .filter((m) => m.conversationId === selectedConversation.id || m.conversation_id === selectedConversation.id)
      .filter((m) => !m.isOptimistic && !isDeletedForMe(m) && !isDeletedForEveryone(m) && !isCallLogMessage(m));
    if (visible.length === 0) return null;
    const last = visible[visible.length - 1];
    return getMsgSenderId(last) !== CURRENT_USER_ID() ? last.id : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localMessages, selectedConversation?.id]);

  useEffect(() => {
    if (!aiAvailable || !selectedConversation || !lastIncomingMessageId) {
      setSmartReplies([]);
      return;
    }
    let cancelled = false;
    setSmartRepliesLoading(true);
    api
      .post("/chat/ai/smart-replies", { conversationId: selectedConversation.id })
      .then((res) => {
        if (cancelled) return;
        const data = unwrapApiData<any>(res.data, "");
        const suggestions: string[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
        setSmartReplies(suggestions.slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setSmartReplies([]);
      })
      .finally(() => {
        if (!cancelled) setSmartRepliesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aiAvailable, selectedConversation?.id, lastIncomingMessageId]);

  /** Send a smart-reply chip as a normal message. */
  const handleSendSmartReply = useCallback(
    async (suggestion: string) => {
      setSmartReplies([]);
      if (!selectedConversation || !suggestion.trim()) return;
      await dispatchOptimisticMessage({ content: suggestion.trim() }, {}, "remove");
    },
    [selectedConversation, dispatchOptimisticMessage]
  );

  /** Translate a message body with MetricAi (target = browser language). */
  const handleTranslateMessage = useCallback(
    (message: ChatMessage) => {
      setActionMenu(null);
      const text = (message.content || "").trim();
      if (!text) {
        toast({ title: "Nothing to translate", description: "Only text messages can be translated." });
        return;
      }
      const target = (navigator.language || "en").slice(0, 2).toLowerCase();
      setTranslatingId(message.id);
      api
        .post("/chat/ai/translate", { text, targetLanguage: target })
        .then((res) => {
          const data = unwrapApiData<any>(res.data, "");
          if (data?.translation) {
            setTranslations((prev) => ({ ...prev, [message.id]: String(data.translation) }));
          }
        })
        .catch((err) => {
          toast({
            variant: "destructive",
            title: "Translation failed",
            description: getApiMessage(err, "MetricAi could not translate this message."),
          });
        })
        .finally(() => setTranslatingId(null));
    },
    [toast]
  );

  /** Summarize the whole conversation with MetricAi (header dropdown). */
  const handleSummarizeConversation = useCallback(() => {
    if (!selectedConversation) return;
    setSummarizeOpen(true);
    setSummarizeLoading(true);
    setSummarizeText("");
    api
      .post(`/chat/conversations/${selectedConversation.id}/ai/summarize`)
      .then((res) => {
        const data = unwrapApiData<any>(res.data, "");
        setSummarizeText(String(data?.summary || "No summary available."));
      })
      .catch((err) => {
        setSummarizeOpen(false);
        toast({
          variant: "destructive",
          title: "Summary failed",
          description: getApiMessage(err, "MetricAi could not summarize this conversation."),
        });
      })
      .finally(() => setSummarizeLoading(false));
  }, [selectedConversation, toast]);

  // ==========================================================================
  // Multi-select: forward / bulk copy / bulk delete-for-me
  // ==========================================================================
  const enterSelectionMode = useCallback((first: ChatMessage) => {
    setActionMenu(null);
    setSelectionMode(true);
    setSelectedMessageIds(new Set([first.id]));
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  const toggleMessageSelection = useCallback((id: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    const ids = new Set<string>();
    localMessages.forEach((m) => {
      if (!isDeletedForMe(m) && !isDeletedForEveryone(m) && !isCallLogMessage(m)) ids.add(m.id);
    });
    setSelectedMessageIds(ids);
  }, [localMessages]);

  /** Forward clicked straight from the action menu: preselect that message. */
  const handleForwardFromMenu = useCallback(
    (message: ChatMessage) => {
      setActionMenu(null);
      setSelectionMode(true);
      setSelectedMessageIds(new Set([message.id]));
      setForwardOpen(true);
    },
    []
  );

  /** Copy every selected message's text (attachments noted by name). */
  const handleCopySelected = useCallback(() => {
    const lines: string[] = [];
    localMessages
      .filter((m) => selectedMessageIds.has(m.id))
      .forEach((m) => {
        const body = (m.content || "").trim();
        const name = getAttachmentName(m);
        if (body) lines.push(body);
        else if (name) lines.push(`[Attachment: ${name}]`);
      });
    if (lines.length === 0) {
      toast({ title: "Nothing to copy" });
      return;
    }
    try {
      navigator.clipboard.writeText(lines.join("\n"));
      toast({ title: `Copied ${selectedMessageIds.size} message${selectedMessageIds.size === 1 ? "" : "s"}` });
      exitSelectionMode();
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Clipboard is unavailable." });
    }
  }, [localMessages, selectedMessageIds, toast, exitSelectionMode]);

  /** Delete every selected message for me (sequential, tolerates partial failure). */
  const [bulkBusy, setBulkBusy] = useState(false);
  const handleDeleteSelected = useCallback(async () => {
    if (!selectedConversation || selectedMessageIds.size === 0) return;
    setBulkBusy(true);
    const ids = [...selectedMessageIds];
    let failed = 0;
    for (const id of ids) {
      const msg = localMessages.find((m) => m.id === id);
      if (!msg) continue;
      try {
        await api.delete(`/chat/conversations/${selectedConversation.id}/messages/${id}?scope=me`);
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(false);
    refetchConv();
    exitSelectionMode();
    if (failed > 0) {
      toast({
        variant: "destructive",
        title: "Some deletes failed",
        description: `${ids.length - failed} deleted, ${failed} could not be removed. Please try again.`,
      });
    } else {
      toast({ title: `Deleted ${ids.length} message${ids.length === 1 ? "" : "s"}` });
    }
  }, [selectedConversation, selectedMessageIds, localMessages, refetchConv, exitSelectionMode, toast]);

  /** Open the forward dialog from the selection bar. */
  const openForwardDialog = useCallback(() => {
    if (selectedMessageIds.size === 0) return;
    setForwardOpen(true);
  }, [selectedMessageIds]);

  /** Fan the selected messages out into the target conversation (chronological). */
  const performForward = useCallback(
    async (targetConversationId: string) => {
      if (selectedMessageIds.size === 0) return;
      setForwardBusy(true);
      const ordered = [...localMessages]
        .filter((m) => selectedMessageIds.has(m.id))
        .sort((a, b) => new Date(getMsgTime(a)).getTime() - new Date(getMsgTime(b)).getTime());
      let sent = 0;
      let failed = 0;
      for (const m of ordered) {
        const payload: Record<string, unknown> = { forwarded: true };
        if ((m.content || "").trim()) payload.content = m.content;
        const url = getAttachmentUrl(m);
        if (url) {
          payload.attachmentUrl = url;
          payload.attachmentType = getAttachmentType(m) || getMessageType(m) || "document";
          if (getAttachmentName(m)) payload.attachmentName = getAttachmentName(m);
          if (getAttachmentSize(m)) payload.attachmentSize = getAttachmentSize(m);
        }
        if (!payload.content && !url) {
          failed += 1;
          continue;
        }
        try {
          await api.post(`/chat/conversations/${targetConversationId}/messages`, payload);
          sent += 1;
        } catch {
          failed += 1;
        }
      }
      setForwardBusy(false);
      setForwardOpen(false);
      exitSelectionMode();
      refetchConv();
      if (sent > 0) {
        toast({ title: `Forwarded ${sent} message${sent === 1 ? "" : "s"}`, description: failed ? `${failed} failed.` : undefined });
      } else {
        toast({ variant: "destructive", title: "Forward failed", description: "Could not forward the selected messages. Please try again." });
      }
    },
    [selectedMessageIds, localMessages, exitSelectionMode, refetchConv, toast]
  );

  /** Copy an image attachment to the OS clipboard (right-click equivalent). */
  const handleCopyImage = useCallback(
    (message: ChatMessage) => {
      setActionMenu(null);
      const url = getAttachmentUrl(message);
      if (!url) return;
      (async () => {
        try {
          const resp = await api.get(url, { responseType: "blob" });
          const blob: Blob = resp.data;
          if (!navigator.clipboard || typeof ClipboardItem === "undefined" || !blob.type.startsWith("image/")) {
            throw new Error("clipboard unsupported");
          }
          await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
          toast({ title: "Image copied", description: "Paste it anywhere (Ctrl+V)." });
        } catch {
          toast({
            variant: "destructive",
            title: "Copy image failed",
            description: "Your browser blocked clipboard image access. Use Download instead.",
          });
        }
      })();
    },
    [toast]
  );

  /** Download any attachment (image / video / document / audio). */
  const handleDownloadAttachment = useCallback(
    (message: ChatMessage) => {
      setActionMenu(null);
      const url = getAttachmentUrl(message);
      if (!url) return;
      const name = getAttachmentName(message) || "attachment";
      downloadChatAttachment(url, name).catch(() =>
        toast({ variant: "destructive", title: "Download failed", description: "Could not download this attachment." })
      );
    },
    [toast]
  );

  /** Composer formatting: wrap the textarea selection in a marker. */
  const applyComposerFormat = useCallback(
    (marker: string) => {
      const el = composerRef.current;
      if (!el) return;
      const start = el.selectionStart ?? newMessage.length;
      const end = el.selectionEnd ?? newMessage.length;
      const next = wrapSelectionWithMarker(newMessage, start, end, marker);
      setNewMessage(next.value);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(next.selectionStart, next.selectionEnd);
      });
    },
    [newMessage]
  );

  /** Paste an image straight from the clipboard into the composer. */
  const handleComposerPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
          e.preventDefault();
          handleFileSelected(file);
        }
      }
    },
    [handleFileSelected]
  );

  /** Scroll a quoted message into view + flash-highlight it for ~2s. */
  const handleQuoteJump = useCallback((quotedId: string) => {
    const el = messageElsRef.current.get(quotedId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlightedId(quotedId);
    window.setTimeout(() => setHighlightedId((cur) => (cur === quotedId ? null : cur)), 2000);
  }, []);

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
    // Groups open the rich info sheet (member management + leave); direct
    // chats keep the lightweight profile modal.
    if (conv.type === "group") {
      setProfileIsGroup(true);
      setProfilePerson(null);
      setGroupInfoOpen(true);
      return;
    }
    setProfileIsGroup(false);
    const p = getDirectParticipant(conv);
    const uid = getParticipantUserId(p);
    const person = buildPerson(uid, getParticipantName(teamMembers, uid, p));
    setProfilePerson(person);
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
    return getParticipantStatusLine(
      p,
      userPresence[profilePerson.userId],
      lastSeenOverrides[profilePerson.userId] ?? p?.lastSeen ?? null
    ).line;
  }, [profileIsGroup, profilePerson, participantById, userPresence, lastSeenOverrides]);

  // ==========================================
  // Block state (batch-4)
  // ==========================================
  const selectedConvView = selectedConversation as ConversationView | null;
  const otherParticipant = useMemo(
    () => (selectedConvView?.type === "direct" ? getDirectParticipant(selectedConvView) : undefined),
    [selectedConvView]
  );
  const otherUserId = getParticipantUserId(otherParticipant);
  const blockedByMe = useMemo(() => {
    const flag = !!(selectedConvView as any)?.blockedByMe || !!(selectedConvView as any)?.blocked_by_me;
    return flag || (!!otherUserId && blockedUserIds.has(otherUserId));
  }, [selectedConvView, otherUserId, blockedUserIds]);
  const blockedMe = useMemo(
    () => !!(selectedConvView as any)?.blockedMe || !!(selectedConvView as any)?.blocked_me,
    [selectedConvView]
  );
  const composerDisabled = blockedByMe || blockedMe;

  const toggleBlockUserById = useCallback(
    async (userId: string) => {
      if (!userId) return;
      const wasBlocked = blockedUserIds.has(userId);
      setBlockBusy(true);
      // Optimistic: flip the local set so the banner/composer react instantly.
      setBlockedUserIds((prev) => {
        const next = new Set(prev);
        if (wasBlocked) next.delete(userId);
        else next.add(userId);
        return next;
      });
      try {
        if (wasBlocked) {
          await api.delete(`/users/${userId}/block`);
          toast({ title: "Unblocked", description: "You can message each other again." });
        } else {
          await api.post(`/users/${userId}/block`);
          toast({ title: "Blocked", description: "This contact can no longer message you." });
        }
        refetchConv();
      } catch (err) {
        // Roll back on failure.
        setBlockedUserIds((prev) => {
          const next = new Set(prev);
          if (wasBlocked) next.add(userId);
          else next.delete(userId);
          return next;
        });
        toast({ variant: "destructive", title: "Error", description: getApiMessage(err, "Failed to update block") });
      } finally {
        setBlockBusy(false);
      }
    },
    [blockedUserIds, refetchConv, toast]
  );

  const toggleBlockContact = useCallback(
    () => toggleBlockUserById(otherUserId),
    [toggleBlockUserById, otherUserId]
  );

  const myGroupRole = useMemo(() => {
    if (!selectedConvView) return null;
    const mine = ((selectedConvView.participants as ChatParticipant[]) || []).find(
      (p) => getParticipantUserId(p) === CURRENT_USER_ID()
    ) as any;
    return (
      (selectedConvView as any).myRole ||
      (selectedConvView as any).my_role ||
      mine?.role ||
      null
    );
  }, [selectedConvView]);

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
                        <span className="metric-ai-glow flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-indigo-500/40">
                          <img src="/Assets/logo-mark.png" alt="" className="h-9 w-9 object-contain" />
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
                {/* Multi-select action bar (WhatsApp-style selection mode) */}
                {selectionMode && (
                  <div className="px-3 sm:px-4 py-2.5 border-b border-border/70 flex items-center justify-between gap-2 bg-blue-600 text-white shrink-0 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 min-w-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:bg-white/15 shrink-0"
                        onClick={exitSelectionMode}
                        aria-label="Cancel selection"
                      >
                        <X className="h-5 w-5" />
                      </Button>
                      <span className="text-sm font-semibold truncate">
                        {selectedMessageIds.size} selected
                      </span>
                      <button
                        type="button"
                        onClick={selectAllVisible}
                        className="text-xs font-medium text-white/80 hover:text-white underline underline-offset-2 ml-1 shrink-0"
                      >
                        Select all
                      </button>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-white hover:bg-white/15"
                        disabled={selectedMessageIds.size === 0 || forwardBusy}
                        onClick={openForwardDialog}
                        title="Forward selected"
                        aria-label="Forward selected"
                      >
                        {forwardBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Forward className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-white hover:bg-white/15"
                        disabled={selectedMessageIds.size === 0}
                        onClick={handleCopySelected}
                        title="Copy selected"
                        aria-label="Copy selected"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-white hover:bg-white/15"
                        disabled={selectedMessageIds.size === 0 || bulkBusy}
                        onClick={handleDeleteSelected}
                        title="Delete for me"
                        aria-label="Delete selected for me"
                      >
                        {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
                {/* Chat Header */}
                <div
                  className={cn(
                    "px-3 sm:px-4 py-2.5 border-b border-border/70 flex items-center justify-between gap-2 bg-card/80 backdrop-blur-md shrink-0",
                    selectionMode && "hidden"
                  )}
                >
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
                      // Prefer the conversation-level otherUserLastSeenAt + socket
                      // presence overrides; fall back to the participant row.
                      const otherLastSeen =
                        lastSeenOverrides[directPid] ??
                        (convView as any).otherUserLastSeenAt ??
                        (convView as any).other_user_last_seen_at ??
                        null;
                      const otherPresence =
                        userPresence[directPid] ??
                        (convView as any).otherUserPresenceStatus ??
                        (convView as any).other_user_presence_status ??
                        undefined;
                      const statusInfo = directP
                        ? getParticipantStatusLine(directP, otherPresence, otherLastSeen ?? getParticipantLastSeen(directP))
                        : null;
                      // Groups: "{n} members · {m} online"
                      const groupMembers = (convView.participants as ChatParticipant[]) || [];
                      const groupOnline = groupMembers.filter((p) => {
                        const uid = getParticipantUserId(p);
                        const presence = userPresence[uid] ?? (p as any).presenceStatus ?? (p as any).presence_status;
                        const active = ["online", "busy", "in-meeting", "calling", "do-not-disturb"].includes(presence);
                        return active || isRecent(lastSeenOverrides[uid] ?? getParticipantLastSeen(p));
                      }).length;
                      const headerDotColor = statusInfo
                        ? statusInfo.isOnlineDot
                          ? getPresenceColor(otherPresence)
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
                                : `${groupMembers.length} ${groupMembers.length === 1 ? "member" : "members"} · ${groupOnline} online`}
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
                      {aiAvailable && (
                        <DropdownMenuItem onClick={handleSummarizeConversation}>
                          <Sparkles className="h-4 w-4 mr-2 text-violet-500" />Summarize with MetricAi
                        </DropdownMenuItem>
                      )}
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
                      // Ephemeral system rows ("X left the group")
                      if ((msg as any).system || getMessageType(msg) === "system") {
                        return <SystemRow key={msg.id} content={msg.content || ""} />;
                      }
                      const isOwn = getMsgSenderId(msg) === CURRENT_USER_ID();
                      // System call summaries render as a WhatsApp-style list row.
                      // Detection is robust: messageType flag OR call-log JSON content.
                      if (isCallLogMessage(msg)) {
                        return (
                          <div
                            key={msg.id}
                            ref={(el) => {
                              if (el) messageElsRef.current.set(msg.id, el);
                              else messageElsRef.current.delete(msg.id);
                            }}
                          >
                            <CallLogRow
                              content={msg.content}
                              createdAt={getMsgTime(msg)}
                              isOwn={isOwn}
                              onOpen={(meta) => setCallSummaryMeta(meta)}
                            />
                          </div>
                        );
                      }
                      return (
                        <div
                          key={msg.id}
                          ref={(el) => {
                            if (el) messageElsRef.current.set(msg.id, el);
                            else messageElsRef.current.delete(msg.id);
                          }}
                        >
                          <MessageBubble
                            message={msg}
                            isOwn={isOwn}
                            isGrouped={!!item.isGrouped}
                            showSender={!!item.showSender}
                            senderName={item.senderName || ""}
                            senderAvatarUrl={getSenderAvatarUrl(msg)}
                            onSenderClick={() => openMessageSenderProfile(msg)}
                            members={teamMembers}
                            onRetry={msg.status === "failed" ? () => handleRetryMessage(msg) : undefined}
                            highlighted={highlightedId === msg.id}
                            onQuoteClick={handleQuoteJump}
                            onOpenMenu={
                              selectionMode
                                ? undefined
                                : (m, x, y) => setActionMenu({ message: m, x, y })
                            }
                            onReplySwipe={selectionMode ? undefined : handleMessageReply}
                            translatedText={translations[msg.id]}
                            selectionActive={selectionMode}
                            selected={selectedMessageIds.has(msg.id)}
                            onToggleSelect={toggleMessageSelection}
                          />
                        </div>
                      );
                    })
                  )}
                  {isTyping && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-3 sm:p-4 border-t border-border/70 bg-card/80 backdrop-blur-md shrink-0">
                  {/* Blocked banners (batch-4) */}
                  {blockedByMe && (
                    <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                      <p className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <Ban className="h-3.5 w-3.5 shrink-0" />
                        You blocked this contact
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-lg border-amber-500/50 text-amber-700 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400"
                        disabled={blockBusy}
                        onClick={toggleBlockContact}
                      >
                        {blockBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3 mr-1" />}
                        Unblock
                      </Button>
                    </div>
                  )}
                  {blockedMe && (
                    <div className="mb-2 flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/50 px-3 py-2">
                      <Ban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">You can't reply to this contact anymore</p>
                    </div>
                  )}

                  {/* Emoji | Stickers | GIF picker — attaches above the composer */}
                  {pickerOpen && !isRecording && !composerDisabled && (
                    <div className="flex justify-start">
                      <StickerEmojiGifPanel
                        onEmojiSelect={handlePanelEmojiSend}
                        onStickerSelect={handleSendSticker}
                        onGifSelect={handleSendGif}
                      />
                    </div>
                  )}

                  {/* MetricAi smart replies — WhatsApp-surpassing suggestion chips */}
                  {aiAvailable && !selectionMode && !editing && !isRecording && !composerDisabled && (smartRepliesLoading || smartReplies.length > 0) && (
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      {smartRepliesLoading ? (
                        <span className="flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/5 px-3 py-1 text-[11px] font-medium text-violet-500 dark:text-violet-400">
                          <Sparkles className="h-3 w-3" /> MetricAi is thinking…
                        </span>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-hidden />
                          {smartReplies.map((suggestion, i) => (
                            <button
                              key={`sr-${i}`}
                              type="button"
                              onClick={() => handleSendSmartReply(suggestion)}
                              className="max-w-[240px] truncate rounded-full border border-violet-500/40 bg-violet-500/5 px-3 py-1 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-500/15 dark:text-violet-400"
                              title={suggestion}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  {/* Inline edit bar (batch-4) */}
                  {editing && !isRecording && (
                    <div className="mb-2 flex items-start gap-2 rounded-xl border border-blue-500/40 bg-blue-500/5 px-3 py-2">
                      <PencilLine className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Editing message</p>
                        <p className="truncate text-xs text-muted-foreground">{editing.original}</p>
                      </div>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Cancel edit"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Reply preview chip (batch-4) */}
                  {replyTo && !editing && !isRecording && !composerDisabled && (
                    <div className="mb-2 flex items-start gap-2 rounded-xl border border-border/70 bg-muted/60 px-3 py-2">
                      <Reply className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                          {replyTo.senderName || "User"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {quotedSnippet(replyTo as MessageReplySnapshot)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyTo(null)}
                        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Cancel reply"
                      >
                        <X className="h-4 w-4" />
                      </button>
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
                  ) : composerDisabled ? (
                    /* Blocked: composer hidden — the banner above explains why. */
                    <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                      {blockedByMe ? "Unblock this contact to send messages" : "Messaging unavailable"}
                    </div>
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
                      <div className="flex-1">
                        {/* Text styling toolbar (WhatsApp-style *bold* _italic_ ~strike~ `code`) */}
                        {(composerFocused || newMessage) && (
                          <div className="mb-1 flex items-center gap-0.5">
                            {[
                              { icon: Bold, marker: "*", label: "Bold" },
                              { icon: Italic, marker: "_", label: "Italic" },
                              { icon: Strikethrough, marker: "~", label: "Strikethrough" },
                              { icon: Code2, marker: "`", label: "Monospace" },
                            ].map(({ icon: Icon, marker, label }) => (
                              <button
                                key={label}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => applyComposerFormat(marker)}
                                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                title={`${label} (wraps selection)`}
                                aria-label={label}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </button>
                            ))}
                            <span className="ml-1 hidden text-[10px] text-muted-foreground sm:inline">
                              or type *bold* _italic_ ~strike~ \`code\`
                            </span>
                          </div>
                        )}
                        <div className="flex items-end bg-muted/60 border border-border/80 rounded-2xl px-3 py-1.5 focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                        <Textarea
                          ref={composerRef}
                          placeholder={editing ? "Edit message…" : "Type a message..."}
                          value={newMessage}
                          onChange={(e) => handleInputChange(e.target.value)}
                          onFocus={() => setComposerFocused(true)}
                          onBlur={() => setComposerFocused(false)}
                          onPaste={handleComposerPaste}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                            if (e.key === "Escape" && editing) {
                              e.preventDefault();
                              cancelEdit();
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
                            disabled={!hasInputContent && !editing}
                            size="icon"
                            className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 shadow-sm shadow-blue-600/30 disabled:opacity-30 shrink-0"
                            title={editing ? "Save edit" : "Send message"}
                          >
                            {editing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                          </Button>
                        </div>
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

      {/* Profile view modal (direct partner / message sender) */}
      <ChatProfileModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        person={profilePerson}
        isGroup={profileIsGroup}
        groupName={
          profileIsGroup && selectedConversation
            ? getConversationName(teamMembers, selectedConversation as ConversationView)
            : null
        }
        groupAvatarUrl={
          profileIsGroup && selectedConversation
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
        isBlockedByMe={!!profilePerson && blockedUserIds.has(profilePerson.userId)}
        onToggleBlock={profilePerson ? () => toggleBlockUserById(profilePerson.userId) : undefined}
        blockBusy={blockBusy}
      />

      {/* Group info sheet (member management + leave) — batch-4 */}
      <GroupInfoSheet
        open={groupInfoOpen}
        onOpenChange={setGroupInfoOpen}
        conversationId={selectedConversation?.id || ""}
        groupName={
          selectedConversation
            ? getConversationName(teamMembers, selectedConversation as ConversationView)
            : ""
        }
        groupAvatarUrl={
          selectedConversation
            ? getConversationAvatarUrl(selectedConversation as ConversationView)
            : ""
        }
        myRole={myGroupRole}
        onLeft={() => {
          setSelectedConversation(null);
          setMobileShowSidebar(true);
          refetchConv();
        }}
        blockedUserIds={blockedUserIds}
        onBlockedChanged={() => {
          // Re-hydrate the block list (cheap) after member-sheet block changes.
          api
            .get("/users/blocked")
            .then((res) => {
              const data = unwrapApiData<any>(res.data, "");
              const list: any[] = Array.isArray(data) ? data : data?.blocked || data?.users || data?.data || [];
              const ids = new Set<string>();
              (Array.isArray(list) ? list : []).forEach((b: any) => {
                const id = b?.userId || b?.user_id || b?.id;
                if (id) ids.add(String(id));
              });
              setBlockedUserIds(ids);
            })
            .catch(() => {});
        }}
      />

      {/* Call summary sheet (from call-log rows) — batch-4 */}
      <CallSummarySheet
        open={!!callSummaryMeta}
        onOpenChange={(open) => {
          if (!open) setCallSummaryMeta(null);
        }}
        meta={callSummaryMeta}
      />

      {/* Floating message action menu (hover button / long-press / right-click) */}
      <MessageActionMenu
        target={actionMenu}
        isOwn={actionMenu ? getMsgSenderId(actionMenu.message) === CURRENT_USER_ID() : false}
        canCopy={!!actionMenu?.message.content && !isCallLogMessage(actionMenu.message) && !isDeletedForMe(actionMenu.message) && !isDeletedForEveryone(actionMenu.message)}
        canEdit={actionMenu ? canEditMessage(actionMenu.message) : false}
        canDeleteEveryone={
          actionMenu
            ? getMsgSenderId(actionMenu.message) === CURRENT_USER_ID() &&
              !isCallLogMessage(actionMenu.message) &&
              !isDeletedForEveryone(actionMenu.message)
            : false
        }
        canForward={
          actionMenu
            ? !isCallLogMessage(actionMenu.message) &&
              !isDeletedForMe(actionMenu.message) &&
              !isDeletedForEveryone(actionMenu.message)
            : false
        }
        hasImageAttachment={actionMenu ? isImageAttachment(actionMenu.message) && !!getAttachmentUrl(actionMenu.message) : false}
        hasDownloadableAttachment={
          actionMenu
            ? !!getAttachmentUrl(actionMenu.message) &&
              !isCallLogMessage(actionMenu.message) &&
              !isDeletedForMe(actionMenu.message) &&
              !isDeletedForEveryone(actionMenu.message)
            : false
        }
        canTranslate={aiAvailable && !!actionMenu?.message.content && !isCallLogMessage(actionMenu.message)}
        onReply={handleMessageReply}
        onCopy={handleMessageCopy}
        onEdit={handleMessageEdit}
        onDeleteForMe={(m) => {
          setActionMenu(null);
          setDeleteConfirm({ message: m, scope: "me" });
        }}
        onDeleteForEveryone={(m) => {
          setActionMenu(null);
          setDeleteConfirm({ message: m, scope: "everyone" });
        }}
        onForward={handleForwardFromMenu}
        onSelect={enterSelectionMode}
        onCopyImage={handleCopyImage}
        onDownloadAttachment={handleDownloadAttachment}
        onTranslate={handleTranslateMessage}
        onClose={() => setActionMenu(null)}
      />

      {/* Delete confirmation (scope me / everyone) */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.scope === "everyone" ? "Delete for everyone?" : "Delete for me?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.scope === "everyone"
                ? "This message will be removed for everyone in this conversation. This cannot be undone."
                : "This message will be removed from this device only. Other participants will still see it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                confirmDelete(deleteConfirm?.scope || "me");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Forward dialog: pick a destination conversation for the selection */}
      <Dialog open={forwardOpen} onOpenChange={(open) => { if (!open) setForwardOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Forward {selectedMessageIds.size} message{selectedMessageIds.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>Choose a conversation to forward the selected messages to.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={forwardSearch}
              onChange={(e) => setForwardSearch(e.target.value)}
              placeholder="Search chats…"
              className="pl-8"
            />
          </div>
          <ScrollArea className="max-h-[320px] -mx-2 px-2">
            <div className="space-y-0.5 py-1">
              {(conversations || [])
                .filter((c) => c.id !== selectedConversation?.id)
                .filter((c) => {
                  if (!forwardSearch.trim()) return true;
                  const name = getConversationName(teamMembers, c as ConversationView) || "";
                  return name.toLowerCase().includes(forwardSearch.trim().toLowerCase());
                })
                .map((c) => {
                  const name = getConversationName(teamMembers, c as ConversationView) || "Chat";
                  const avatarUrl = getConversationAvatarUrl(c as ConversationView);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={forwardBusy}
                      onClick={() => performForward(c.id)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <Avatar className="h-9 w-9">
                        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                        <AvatarFallback className={cn("bg-gradient-to-br text-white font-semibold text-[11px]", getAvatarGradient(name))}>
                          {getInitials(name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                      {forwardBusy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Forward className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  );
                })}
              {(conversations || []).filter((c) => c.id !== selectedConversation?.id).length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">No other conversations yet.</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* MetricAi conversation summary modal */}
      <Dialog open={summarizeOpen} onOpenChange={(open) => { if (!open) setSummarizeOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" /> MetricAi summary
            </DialogTitle>
            <DialogDescription>
              AI-generated digest of this conversation — summary, key points and action items.
            </DialogDescription>
          </DialogHeader>
          {summarizeLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading the thread…
            </div>
          ) : (
            <ScrollArea className="max-h-[400px] -mx-2 px-2">
              <MarkdownRenderer content={summarizeText || "No summary available."} />
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}