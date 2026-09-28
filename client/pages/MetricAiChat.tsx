import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, Crown, Image as ImageIcon, Lock, Loader2, Sparkles, Trash2, X } from "lucide-react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/components/ui/use-toast";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/datetime";
import { uploadChatMedia } from "@/lib/meetings-chat-calls";
import {
  clearMetricAiHistory,
  getMetricAiHistory,
  getMetricAiStatus,
  sendMetricAiChat,
} from "@/lib/metric-ai";
import { getApiMessage } from "@/lib/api-response";
import { resolveMediaUrl } from "@/lib/media-url";
import type { MetricAiHistoryMessage, MetricAiStatus } from "@shared/api";

/**
 * MetricAi — the Metricorex AI assistant (WhatsApp "Meta AI" equivalent).
 *
 * - Plan gate: GET /ai/status; when unavailable a locked card offers Upgrade.
 * - History: GET /ai/history (user right / assistant left, markdown replies).
 * - Ask: POST /ai/chat { message }; `imageUrl` renders the generated image
 *   above the reply when the user asked for one.
 * - Clear: DELETE /ai/history after confirmation.
 */

type MetricAiMessage = MetricAiHistoryMessage & {
  /** Local-only pending flag for optimistic messages. */
  pending?: boolean;
};

const METRIC_AI_LOGO = "/Assets/logo.png";

export default function MetricAiChat() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [status, setStatus] = useState<MetricAiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusDenied, setStatusDenied] = useState(false);

  const [messages, setMessages] = useState<MetricAiMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ url: string; name: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const available = !!status?.available;

  // ------------------------------------------
  // Boot: status gate + history
  // ------------------------------------------
  useEffect(() => {
    let disposed = false;
    (async () => {
      setStatusLoading(true);
      try {
        const s = await getMetricAiStatus();
        if (disposed) return;
        setStatus(s);
        setStatusDenied(false);
        if (s.available) {
          setHistoryLoading(true);
          try {
            const history = await getMetricAiHistory(1, 50);
            if (!disposed) setMessages(history.messages || []);
          } catch (err) {
            // History is non-critical; surface a toast but keep the chat usable.
            if (!disposed) {
              toast({
                variant: "destructive",
                title: "MetricAi",
                description: getApiMessage(err, "Could not load your MetricAi history."),
              });
            }
          } finally {
            if (!disposed) setHistoryLoading(false);
          }
        }
      } catch (err: any) {
        if (disposed) return;
        // 403 metric_ai_not_enabled (or a wrapped failure) -> locked state.
        const code = (err?.response?.data?.code || err?.response?.data?.data?.code || "").toString();
        if (err?.response?.status === 403 || code === "metric_ai_not_enabled") {
          setStatusDenied(true);
        } else {
          toast({
            variant: "destructive",
            title: "MetricAi",
            description: getApiMessage(err, "Could not reach MetricAi. Please try again later."),
          });
        }
      } finally {
        if (!disposed) setStatusLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [toast]);

  // Auto-scroll while messages arrive / assistant thinks
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, waiting, historyLoading]);

  // ------------------------------------------
  // Composer helpers
  // ------------------------------------------
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  const send = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? draft).trim();
      if (!text || waiting || !available) return;

      const userMsg: MetricAiMessage = {
        id: `local-user-${Date.now()}`,
        role: "user",
        content: text,
        imageUrl: pendingImage?.url || null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg]);
      setDraft("");
      setPendingImage(null);
      if (textareaRef.current) textareaRef.current.style.height = "0px";
      setWaiting(true);

      try {
        // The /ai/chat endpoint is text-only; when an image is attached we
        // pass its public URL along as context (the bubble stays clean).
        const apiText = pendingImage?.url ? `${text}\n\n(Image attached: ${pendingImage.url})` : text;
        const result = await sendMetricAiChat(apiText);
        setMessages((prev) => [
          ...prev,
          {
            id: result.id || `assistant-${Date.now()}`,
            role: "assistant",
            content: result.reply || "",
            imageUrl: result.imageUrl ? resolveMediaUrl(result.imageUrl) : null,
            createdAt: result.createdAt || new Date().toISOString(),
          },
        ]);
      } catch (err: any) {
        const code = (err?.response?.data?.code || err?.response?.data?.data?.code || "").toString();
        if (err?.response?.status === 403 || code === "metric_ai_not_enabled") {
          setStatusDenied(true);
          setStatus((prev) => (prev ? { ...prev, available: false, enabled: false } : prev));
        }
        toast({
          variant: "destructive",
          title: "MetricAi",
          description: getApiMessage(err, "MetricAi could not answer. Please try again."),
        });
      } finally {
        setWaiting(false);
      }
    },
    [draft, waiting, available, pendingImage, toast]
  );

  const handlePhotoPicked = useCallback(
    async (file?: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast({ variant: "destructive", title: "MetricAi", description: "Please pick an image file." });
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast({ variant: "destructive", title: "Image too large", description: "Images are limited to 8 MB." });
        return;
      }
      setUploadingImage(true);
      try {
        const media = await uploadChatMedia(file);
        setPendingImage({ url: resolveMediaUrl(media.url), name: media.name || file.name });
        if (!draft.trim()) {
          // Give the user a sensible starting prompt for the attached image.
          setDraft("What do you see in this image?");
          window.setTimeout(() => textareaRef.current?.focus(), 50);
        }
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: getApiMessage(err, "Could not upload the image."),
        });
      } finally {
        setUploadingImage(false);
      }
    },
    [draft, toast]
  );

  const handleClearConversation = useCallback(async () => {
    setClearing(true);
    try {
      await clearMetricAiHistory();
      setMessages([]);
      toast({ title: "Conversation cleared" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "MetricAi",
        description: getApiMessage(err, "Could not clear the conversation."),
      });
    } finally {
      setClearing(false);
      setClearDialogOpen(false);
    }
  }, [toast]);

  // ------------------------------------------
  // Render
  // ------------------------------------------
  const showLocked = statusLoading ? false : (statusDenied || (status ? !status.available : false));

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100dvh-118px)] sm:h-[calc(100dvh-78px)] min-h-[420px]">
        <div className="flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm relative">
          {/* Dot-grid backdrop matching the chat page */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(rgba(127,127,127,0.13) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />

          {statusLoading ? (
            <div className="relative h-full flex items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : showLocked ? (
            /* ---------- Locked (plan gate) ---------- */
            <div className="relative h-full flex items-center justify-center p-6">
              <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-8 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Lock className="h-7 w-7 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">MetricAi is not part of your current plan</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {status?.planName
                    ? `Your ${status.planName} plan doesn't include MetricAi. Upgrade to chat with the Metricorex AI assistant, generate images and more.`
                    : "Upgrade your plan to chat with the Metricorex AI assistant, generate images and more."}
                </p>
                <Button
                  className="mt-5 rounded-xl bg-gradient-to-r from-[#4F46E5] to-[#2563EB] text-white shadow-md hover:from-[#4338CA] hover:to-[#1D4ED8]"
                  onClick={() => navigate("/subscription")}
                >
                  <Crown className="h-4 w-4 mr-2" />
                  Upgrade
                </Button>
              </div>
            </div>
          ) : (
            /* ---------- Active chat ---------- */
            <div className="relative h-full flex flex-col">
              {/* Header */}
              <div className="px-3 sm:px-5 py-3 border-b border-border/70 flex items-center justify-between gap-2 bg-card/80 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="metric-ai-glow flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#2563EB] ring-1 ring-indigo-500/40">
                    <img src={METRIC_AI_LOGO} alt="MetricAi logo" className="h-7 w-7 rounded-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-semibold text-foreground truncate">MetricAi</h1>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Always on · Powered by Metricorex
                      {status?.chatModel ? ` · ${status.chatModel}` : ""}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl text-muted-foreground hover:text-red-600 hover:bg-red-500/10 shrink-0"
                  title="Clear conversation"
                  aria-label="Clear conversation"
                  onClick={() => setClearDialogOpen(true)}
                  disabled={clearing || messages.length === 0}
                >
                  {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-3 chat-panel-scroll">
                {historyLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <div className="metric-ai-glow flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#2563EB] mb-4">
                      <img src={METRIC_AI_LOGO} alt="" className="h-10 w-10 rounded-full object-cover" />
                    </div>
                    <p className="font-semibold text-foreground/90">Hi, I'm MetricAi</p>
                    <p className="text-sm text-muted-foreground/85 mt-1 max-w-sm">
                      Ask me anything — answers, ideas, summaries, or say “generate an image of…” and I'll create one.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => <MetricAiBubble key={msg.id} message={msg} />)
                )}
                {waiting && <TypingDots />}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="p-3 sm:p-4 border-t border-border/70 bg-card/80 backdrop-blur-md shrink-0">
                {pendingImage && (
                  <div className="mb-2 inline-flex items-center gap-2 rounded-xl border border-border/70 bg-muted/60 p-1.5 pr-2">
                    <img src={pendingImage.url} alt={pendingImage.name} className="h-10 w-10 rounded-lg object-cover" />
                    <span className="max-w-[160px] truncate text-xs text-muted-foreground">{pendingImage.name}</span>
                    <button
                      type="button"
                      onClick={() => setPendingImage(null)}
                      aria-label="Remove attached image"
                      className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingImage || waiting}
                    title="Attach a photo"
                    aria-label="Attach a photo"
                  >
                    {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                  </Button>
                  <div className="flex-1 flex items-end bg-muted/60 border border-border/80 rounded-2xl px-3 py-1.5 focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      placeholder="Ask MetricAi anything…"
                      onChange={(e) => {
                        setDraft(e.target.value);
                        autoGrow();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={1}
                      aria-label="Message MetricAi"
                      className="flex-1 min-h-[36px] max-h-[140px] resize-none bg-transparent border-0 outline-none py-1.5 px-0 text-sm text-foreground placeholder:text-muted-foreground"
                    />
                    <Button
                      onClick={() => send()}
                      disabled={!draft.trim() || waiting}
                      size="icon"
                      className="metric-ai-glow h-9 w-9 rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#2563EB] text-white shadow-sm hover:from-[#4338CA] hover:to-[#1D4ED8] disabled:opacity-30 shrink-0 mb-0.5"
                      title="Send"
                      aria-label="Send message"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    handlePhotoPicked(f);
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear conversation?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes your entire MetricAi history on the server. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={clearing}
                onClick={(e) => {
                  e.preventDefault();
                  handleClearConversation();
                }}
              >
                {clearing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Clear
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}

// ==========================================
// Sub-components
// ==========================================

function MetricAiGlowAvatar({ size = 32 }: { size?: number }) {
  return (
    <span
      className="metric-ai-glow flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#2563EB] ring-1 ring-indigo-500/40"
      style={{ width: size, height: size }}
    >
      <img src={METRIC_AI_LOGO} alt="" className="rounded-full object-cover" style={{ width: size * 0.64, height: size * 0.64 }} />
    </span>
  );
}

function MetricAiBubble({ message }: { message: MetricAiMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-200">
        <div className="max-w-[85%] sm:max-w-[72%] flex flex-col items-end gap-1">
          {message.imageUrl && (
            <img
              src={message.imageUrl}
              alt="Attached"
              className="max-h-60 w-auto max-w-[280px] rounded-xl object-cover"
            />
          )}
          {message.content && (
            <div className="px-3.5 py-2.5 rounded-2xl rounded-br-md bg-gradient-to-br from-blue-600 via-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/15">
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          )}
          <span className="text-[10px] text-muted-foreground/70">{formatTime(message.createdAt)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <MetricAiGlowAvatar />
      <div className="max-w-[88%] sm:max-w-[76%] flex flex-col items-start gap-1">
        <div className="px-3.5 py-2 rounded-2xl rounded-bl-md bg-card border border-border/80 shadow-sm">
          {message.imageUrl && (
            <img
              src={message.imageUrl}
              alt="MetricAi generated"
              className="mb-2 max-h-72 w-auto max-w-[320px] rounded-xl object-cover"
            />
          )}
          {message.content ? (
            <MarkdownRenderer content={message.content} className="text-sm" />
          ) : (
            <p className="text-sm italic text-muted-foreground">(empty reply)</p>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/70">{formatTime(message.createdAt)}</span>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-start gap-2 animate-in fade-in duration-200">
      <MetricAiGlowAvatar />
      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-card border border-border/80 shadow-sm flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" />
        <Sparkles className="ml-1 h-3 w-3 text-indigo-400" />
      </div>
    </div>
  );
}
