import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Crown,
  Headset,
  Image as ImageIcon,
  Loader2,
  Lock,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/datetime";
import { uploadChatMedia } from "@/lib/meetings-chat-calls";
import { api } from "@/lib/api-client";
import { getApiErrorCode, getApiMessage } from "@/lib/api-response";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  clearMetricAiHistory,
  getMetricAiHistory,
  getMetricAiStatus,
  sendMetricAiChat,
} from "@/lib/metric-ai";
import {
  METRIC_AI_SUPPORT_KEY,
  askPublicMetricAi,
  clearStoredSupportThread,
  closeMySupportConversation,
  escalateToSupport,
  getMySupportMessages,
  postMySupportMessage,
  readAskSessionId,
  readStoredSupportThread,
  writeAskSessionId,
  writeAskSessionId,
  writeStoredSupportThread,
  type SupportMessage,
  type SupportThreadStatus,
  type SupportTranscriptTurn,
} from "@/lib/support-api";
import type { MetricAiHistoryMessage, MetricAiStatus } from "@shared/api";

/**
 * MetricAi — the Metricorex AI assistant (WhatsApp "Meta AI" equivalent).
 *
 * - Plan gate: GET /ai/status; when unavailable a locked card offers Upgrade.
 * - History: GET /ai/history (user right / assistant left, markdown replies).
 * - Ask: POST /ai/chat { message }; `imageUrl` renders the generated image
 *   above the reply when the user asked for one.
 * - Clear: DELETE /ai/history after confirmation.
 * - Human handoff: when a reply carries suggestHumanSupport, a "Talk to a
 *   human" card opens a dialog (name + email prefilled from the auth
 *   profile) that POSTs the transcript to /support/escalate (channel
 *   'metric_ai'). Success shows a persistent support strip with an
 *   "Open support chat" toggle -> live support conversation view (5s
 *   polling, status pill, conclude chat).
 */

type MetricAiMessage = MetricAiHistoryMessage & {
  /** Local-only pending flag for optimistic messages. */
  pending?: boolean;
  /** Local-only marker for the human-handoff card pseudo-message. */
  kind?: "chat" | "handoff";
};

const METRIC_AI_LOGO = "/icon-192.png"; // square brand mark — the wide wordmark gets cropped to blank inside rounded-full avatar circles
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function MetricAiChat() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [status, setStatus] = useState<MetricAiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusDenied, setStatusDenied] = useState(false);
  // Help mode: free MetricAi via the PUBLIC endpoint (Metricorex-scoped +
  // human handoff). Used when the visitor is not logged in (401) or their
  // plan does not include the full assistant (403 metric_ai_not_enabled).
  const [helpMode, setHelpMode] = useState(false);
  const helpSessionRef = useRef<string | null>(null);

  const [messages, setMessages] = useState<MetricAiMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ url: string; name: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // ---- Human handoff / support state ----
  const [handoffDialogOpen, setHandoffDialogOpen] = useState(false);
  const [handoffName, setHandoffName] = useState("");
  const [handoffEmail, setHandoffEmail] = useState("");
  const [handoffPrefilled, setHandoffPrefilled] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [support, setSupport] = useState<{ id: string } | null>(null);
  const [view, setView] = useState<"ai" | "support">("ai");
  const supportRef = useRef<{ id: string } | null>(null);
  supportRef.current = support;

  const photoInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const available = !!status?.available || helpMode;

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
        if (!s.available) {
          // Plan without the full assistant -> free public help mode.
          setHelpMode(true);
          helpSessionRef.current = readAskSessionId();
        }
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
        if (err?.response?.status === 401 || err?.response?.status === 403 || code === "metric_ai_not_enabled") {
          // Not logged in (401) or plan without the full assistant (403):
          // fall back to the free public MetricAi (Metricorex-scoped).
          setHelpMode(true);
          helpSessionRef.current = readAskSessionId();
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

  // ------------------------------------------
  // Restore a persisted support thread (if any) — shows the strip when the
  // conversation still exists and hasn't been concluded.
  // ------------------------------------------
  useEffect(() => {
    const stored = readStoredSupportThread(METRIC_AI_SUPPORT_KEY);
    if (!stored) return;
    let disposed = false;
    (async () => {
      try {
        const res = await getMySupportMessages(stored.conversationId);
        if (disposed) return;
        if (res.status === "resolved" || res.status === "closed") {
          clearStoredSupportThread(METRIC_AI_SUPPORT_KEY);
        } else {
          setSupport({ id: stored.conversationId });
        }
      } catch (err: any) {
        if (disposed) return;
        if (err?.response?.status === 404) {
          clearStoredSupportThread(METRIC_AI_SUPPORT_KEY);
        }
        // Other failures: skip the strip for this session.
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  // Prefill the handoff dialog (localStorage first, then the auth profile).
  useEffect(() => {
    if (!handoffDialogOpen || handoffPrefilled) return;
    setHandoffPrefilled(true);
    let storedName = "";
    let storedEmail = "";
    try {
      storedName = localStorage.getItem("userName") || "";
      storedEmail = localStorage.getItem("userEmail") || "";
    } catch {
      /* ignore */
    }
    setHandoffName((prev) => prev || storedName);
    setHandoffEmail((prev) => prev || storedEmail);
    (async () => {
      try {
        const res = await api.get("/settings");
        const body = res?.data || {};
        const profile = body?.profile || body?.data?.profile || null;
        if (profile?.name) setHandoffName((prev) => prev || String(profile.name));
        if (profile?.email) setHandoffEmail((prev) => prev || String(profile.email));
      } catch {
        /* prefill is best-effort */
      }
    })();
  }, [handoffDialogOpen, handoffPrefilled]);

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
        let result: any;
        if (!helpMode) {
          try {
            result = await sendMetricAiChat(apiText);
          } catch (err: any) {
            const gcode = (err?.response?.data?.code || err?.response?.data?.data?.code || "").toString();
            const gated =
              err?.response?.status === 401 ||
              err?.response?.status === 403 ||
              gcode === "metric_ai_not_enabled";
            if (!gated) throw err;
            // Seamless downgrade: retry through the free public endpoint.
            setHelpMode(true);
            helpSessionRef.current = readAskSessionId();
            toast({
              title: "Free help mode",
              description: "You are now chatting with MetricAi in free Metricorex-help mode. Sign in for the full assistant.",
            });
            result = await askPublicMetricAi(apiText, helpSessionRef.current || undefined);
            if (result.sessionId) {
              helpSessionRef.current = result.sessionId;
              writeAskSessionId(result.sessionId);
            }
          }
        } else {
          result = await askPublicMetricAi(apiText, helpSessionRef.current || undefined);
          if (result.sessionId) {
            helpSessionRef.current = result.sessionId;
            writeAskSessionId(result.sessionId);
          }
        }
        const assistantMsg: MetricAiMessage = {
          id: result.id || `assistant-${Date.now()}`,
          role: "assistant",
          content: result.reply || "",
          imageUrl: result.imageUrl ? resolveMediaUrl(result.imageUrl) : null,
          createdAt: result.createdAt || new Date().toISOString(),
        };
        setMessages((prev) => {
          // Drop any previous handoff card — the newest reply owns it now.
          const cleaned = prev.filter((m) => m.kind !== "handoff");
          const next = [...cleaned, assistantMsg];
          if (result.suggestHumanSupport && !supportRef.current) {
            next.push({
              id: `handoff-${Date.now()}`,
              role: "assistant",
              content: "",
              imageUrl: null,
              createdAt: new Date().toISOString(),
              kind: "handoff",
            });
          }
          return next;
        });
        if (result.suggestHumanSupport && supportRef.current) {
          toast({
            title: "MetricAi",
            description: "You already have a support chat open — open it below to continue with Support.",
          });
        }
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
  // Human handoff — escalate the MetricAi thread to Support
  // ------------------------------------------
  const submitEscalate = useCallback(async () => {
    const cleanName = handoffName.trim();
    const cleanEmail = handoffEmail.trim();
    if (!cleanName || !EMAIL_RE.test(cleanEmail)) {
      toast({
        variant: "destructive",
        title: "Support",
        description: "Please enter your name and a valid email address.",
      });
      return;
    }
    setEscalating(true);
    try {
      const transcript: SupportTranscriptTurn[] = messages
        .filter((m) => m.kind !== "handoff" && !m.pending && m.content)
        .map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt }));
      const result = await escalateToSupport({
        name: cleanName,
        email: cleanEmail,
        channel: "metric_ai",
        subject: "MetricAi handoff",
        transcript,
      });
      // Authenticated page: no accessKey needed (bearer identifies the caller).
      writeStoredSupportThread({ conversationId: result.conversationId, accessKey: null }, METRIC_AI_SUPPORT_KEY);
      setSupport({ id: result.conversationId });
      setMessages((prev) => prev.filter((m) => m.kind !== "handoff"));
      setHandoffDialogOpen(false);
      toast({
        title: "Support request submitted",
        description: `Request #${result.conversationId.slice(0, 8)} created — we'll reply here and by email.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Support",
        description: getApiMessage(err, "Could not submit your support request. Please try again."),
      });
    } finally {
      setEscalating(false);
    }
  }, [handoffName, handoffEmail, messages, toast]);

  // ------------------------------------------
  // Render
  // ------------------------------------------
  const showLocked = statusLoading ? false : !helpMode && (statusDenied || (status ? !status.available : false));

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
          ) : view === "support" && support ? (
            /* ---------- Support conversation view ---------- */
            <SupportConversation
              conversationId={support.id}
              onBack={() => setView("ai")}
              onGone={() => {
                clearStoredSupportThread(METRIC_AI_SUPPORT_KEY);
                setSupport(null);
                setView("ai");
                toast({
                  title: "Support",
                  description: "This support conversation is no longer available.",
                });
              }}
            />
          ) : (
            /* ---------- Active MetricAi chat ---------- */
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
                      {helpMode
                        ? "Free help mode · Metricorex questions · sign in for the full MetricAi"
                        : `Always on · Powered by Metricorex${status?.chatModel ? ` · ${status.chatModel}` : ""}`}
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
                  messages.map((msg) =>
                    msg.kind === "handoff" && !support ? (
                      <HandoffRow key={msg.id} onOpen={() => setHandoffDialogOpen(true)} />
                    ) : msg.kind === "handoff" ? null : (
                      <MetricAiBubble key={msg.id} message={msg} />
                    ),
                  )
                )}
                {waiting && <TypingDots />}
                <div ref={bottomRef} />
              </div>

              {/* Persistent support strip */}
              {support && (
                <div className="mx-3 sm:mx-4 mb-2 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 shrink-0">
                  <Headset className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    Support request #{support.id.slice(0, 8)} submitted — we'll reply here and by email.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setView("support")}
                    className="h-7 shrink-0 rounded-lg bg-emerald-600 px-2.5 text-xs text-white shadow-sm hover:bg-emerald-700"
                  >
                    Open support chat
                  </Button>
                </div>
              )}

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

        {/* Clear-history confirm */}
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

        {/* Human handoff dialog */}
        <Dialog open={handoffDialogOpen} onOpenChange={setHandoffDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15">
                  <Headset className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </span>
                Talk to a human
              </DialogTitle>
              <DialogDescription>
                We'll hand this MetricAi conversation to our human support team. They'll reply here and by email.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="handoff-name">Your name</Label>
                <Input
                  id="handoff-name"
                  value={handoffName}
                  onChange={(e) => setHandoffName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  disabled={escalating}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="handoff-email">Email</Label>
                <Input
                  id="handoff-email"
                  value={handoffEmail}
                  onChange={(e) => setHandoffEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                  disabled={escalating}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setHandoffDialogOpen(false)} disabled={escalating}>
                Cancel
              </Button>
              <Button
                onClick={() => void submitEscalate()}
                disabled={escalating || !handoffName.trim() || !handoffEmail.trim()}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {escalating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Headset className="mr-2 h-4 w-4" />
                )}
                Send to support
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

// ==========================================
// Support conversation view (authenticated page)
// ==========================================

/**
 * Live support conversation: 5s polling with the `?after=` cursor, status
 * pill, customer/agent/system bubbles and a conclude action (customers can
 * conclude too). Handles the `conversation_concluded` rejection gracefully.
 */
function SupportConversation({
  conversationId,
  onBack,
  onGone,
}: {
  conversationId: string;
  onBack: () => void;
  onGone: () => void;
}) {
  const { toast } = useToast();

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [status, setStatus] = useState<SupportThreadStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [concludeOpen, setConcludeOpen] = useState(false);
  const [concluding, setConcluding] = useState(false);

  const afterRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep the latest onGone callback without re-triggering the poll effect
  // when the parent re-renders (its inline identity would otherwise change).
  const onGoneRef = useRef(onGone);
  onGoneRef.current = onGone;

  const concluded = status === "resolved" || status === "closed";

  const poll = useCallback(async () => {
    try {
      const res = await getMySupportMessages(conversationId, afterRef.current || undefined);
      setMessages((prev) => mergeSupportMessages(prev, res.messages));
      if (res.messages.length > 0) {
        afterRef.current = res.messages[res.messages.length - 1].created_at;
      }
      setStatus(res.status);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        onGoneRef.current();
        return;
      }
      // Transient polling errors are ignored — the next tick retries.
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    afterRef.current = "";
    setMessages([]);
    setLoading(true);
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => window.clearInterval(timer);
  }, [poll]);

  // Auto-scroll as messages arrive
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending || concluded) return;
    setSending(true);
    try {
      await postMySupportMessage(conversationId, text);
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "0px";
      await poll();
    } catch (err) {
      if (getApiErrorCode(err) === "CONVERSATION_CONCLUDED") {
        await poll();
        toast({
          title: "Support",
          description: "Support concluded this chat. Start a new request from MetricAi if you still need help.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Support",
          description: getApiMessage(err, "Could not send your message. Please try again."),
        });
      }
    } finally {
      setSending(false);
    }
  }, [draft, sending, concluded, conversationId, poll, toast]);

  const conclude = useCallback(async () => {
    setConcluding(true);
    try {
      await closeMySupportConversation(conversationId);
      await poll();
      toast({ title: "Conversation concluded" });
    } catch (err: any) {
      if (err?.response?.status === 404) {
        onGoneRef.current();
        return;
      }
      toast({
        variant: "destructive",
        title: "Support",
        description: getApiMessage(err, "Could not conclude the conversation."),
      });
    } finally {
      setConcluding(false);
      setConcludeOpen(false);
    }
  }, [conversationId, poll, toast]);

  return (
    <div className="relative h-full flex flex-col">
      {/* Header */}
      <div className="px-3 sm:px-5 py-3 border-b border-border/70 flex items-center justify-between gap-2 bg-card/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={onBack}
            title="Back to MetricAi"
            aria-label="Back to MetricAi"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <Headset className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </span>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 font-semibold text-foreground truncate">
              Support chat
              <SupportStatusPill status={status} />
            </h1>
            <p className="text-[11px] text-muted-foreground truncate">Conversation #{conversationId.slice(0, 8)}</p>
          </div>
        </div>
        {!concluded && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 rounded-xl border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700"
            onClick={() => setConcludeOpen(true)}
            disabled={concluding}
          >
            <XCircle className="mr-1.5 h-4 w-4" />
            Conclude chat
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-3 chat-panel-scroll">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
              <Headset className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </span>
            <p className="font-semibold text-foreground/90">Connecting you to Support…</p>
            <p className="text-sm text-muted-foreground/85 max-w-sm">
              Your MetricAi conversation was shared with our support team. Messages from Support will appear here.
            </p>
          </div>
        ) : (
          messages.map((msg) => <SupportMessageRow key={msg.id} message={msg} />)
        )}
      </div>

      {/* Composer / concluded state */}
      <div className="p-3 sm:p-4 border-t border-border/70 bg-card/80 backdrop-blur-md shrink-0">
        {concluded ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-muted/60 px-3 py-3 text-center text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              {status === "resolved" ? "Support marked this chat as resolved." : "This support chat is closed."}{" "}
              Start a new request from MetricAi anytime.
            </span>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex-1 flex items-end bg-muted/60 border border-border/80 rounded-2xl px-3 py-1.5 focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  autoGrow();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Reply to Support…"
                aria-label="Message support"
                className="flex-1 min-h-[36px] max-h-[140px] resize-none bg-transparent border-0 outline-none py-1.5 px-0 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <Button
                onClick={() => void send()}
                disabled={!draft.trim() || sending}
                size="icon"
                className="h-9 w-9 rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-30 shrink-0 mb-0.5"
                title="Send"
                aria-label="Send message"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Conclude confirm */}
      <AlertDialog open={concludeOpen} onOpenChange={setConcludeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conclude this support chat?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation will be closed and no new messages can be sent. Support can reopen it if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={concluding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={concluding}
              onClick={(e) => {
                e.preventDefault();
                void conclude();
              }}
            >
              {concluding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Conclude
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SupportStatusPill({ status }: { status: SupportThreadStatus | null }) {
  const styles: Record<SupportThreadStatus, string> = {
    open: "bg-primary/10 text-primary",
    pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    resolved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    closed: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize leading-none",
        styles[status || "closed"],
      )}
    >
      {status || "…"}
    </span>
  );
}

function SupportMessageRow({ message }: { message: SupportMessage }) {
  if (message.sender_type === "system") {
    return (
      <div className="flex justify-center animate-in fade-in slide-in-from-bottom-1 duration-200">
        <p className="max-w-[92%] rounded-full bg-muted/70 px-3 py-1.5 text-center text-[11px] text-muted-foreground">
          {message.body}
        </p>
      </div>
    );
  }

  const isCustomer = message.sender_type === "customer";
  if (isCustomer) {
    return (
      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-200">
        <div className="max-w-[85%] sm:max-w-[72%] flex flex-col items-end gap-1">
          <div className="px-3.5 py-2.5 rounded-2xl rounded-br-md bg-gradient-to-br from-blue-600 via-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/15">
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.body}</p>
          </div>
          <span className="text-[10px] text-muted-foreground/70">{formatTime(message.created_at)}</span>
        </div>
      </div>
    );
  }

  // agent (or ai) — left side with an avatar
  const isAi = message.sender_type === "ai";
  return (
    <div className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
      {isAi ? (
        <span className="metric-ai-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#2563EB]">
          <img src={METRIC_AI_LOGO} alt="" className="h-5 w-5 rounded-full object-cover" />
        </span>
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
          <Headset className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </span>
      )}
      <div className="max-w-[88%] sm:max-w-[76%] flex flex-col items-start gap-1">
        <div className="px-3.5 py-2 rounded-2xl rounded-bl-md bg-card border border-border/80 shadow-sm">
          {message.sender_name && (
            <p
              className={cn(
                "mb-0.5 text-[11px] font-semibold",
                isAi ? "text-indigo-500" : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {message.sender_name}
            </p>
          )}
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">{message.body}</p>
        </div>
        <span className="text-[10px] text-muted-foreground/70">{formatTime(message.created_at)}</span>
      </div>
    </div>
  );
}

// ==========================================
// MetricAi chat sub-components
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

/** Highlighted handoff card rendered below a suggestHumanSupport reply. */
function HandoffRow({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
        <Headset className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      </span>
      <div className="max-w-[88%] sm:max-w-[76%] rounded-2xl rounded-bl-md border border-emerald-500/30 bg-emerald-500/5 p-3.5 shadow-sm">
        <p className="text-sm font-semibold text-foreground">Need a human?</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          MetricAi couldn't fully help with this. Our human support team can pick up the conversation from here.
        </p>
        <Button
          size="sm"
          onClick={onOpen}
          className="mt-2.5 h-8 rounded-lg bg-emerald-600 px-3 text-xs text-white shadow-sm hover:bg-emerald-700"
        >
          <Headset className="mr-1.5 h-3.5 w-3.5" />
          Talk to a human
        </Button>
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

// ==========================================
// Helpers
// ==========================================

/** Merge polled support messages into the local list (dedupe by id, ASC). */
function mergeSupportMessages(prev: SupportMessage[], incoming: SupportMessage[]): SupportMessage[] {
  if (!incoming.length) return prev;
  const seen = new Set(prev.map((m) => m.id));
  const merged = [...prev];
  for (const msg of incoming) {
    if (!seen.has(msg.id)) {
      merged.push(msg);
      seen.add(msg.id);
    }
  }
  return merged;
}
