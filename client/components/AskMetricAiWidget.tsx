import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ArrowUp,
  CheckCircle2,
  Headset,
  Loader2,
  Minus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/datetime";
import { resolveMediaUrl } from "@/lib/media-url";
import { api } from "@/lib/api-client";
import { getApiErrorCode, getApiMessage } from "@/lib/api-response";
import { sendMetricAiChat } from "@/lib/metric-ai";
import {
  askPublicMetricAi,
  clearStoredSupportThread,
  escalateToSupport,
  fetchSupportMessages,
  readAskSessionId,
  readStoredSupportThread,
  sendSupportThreadMessage,
  writeAskSessionId,
  writeStoredSupportThread,
  type EscalateSupportResult,
  type StoredSupportThread,
  type SupportMessage,
  type SupportThreadStatus,
  type SupportTranscriptTurn,
} from "@/lib/support-api";

/**
 * AskMetricAiWidget — floating "Ask MetricAi" assistant available on EVERY
 * page (authenticated or not). Mounted once in App.tsx, outside the
 * token-protected routes, and hidden on the video call-room routes so it
 * never covers call controls.
 *
 * Self-contained: exports nothing, owns its own state + persistence.
 *
 * Backend switching:
 *  - Authenticated + plan allows -> POST /ai/chat (bearer via the shared
 *    axios instance). On 403 (plan-gated) or 401 (logged out) the widget
 *    falls back to the public endpoint for the rest of the session and shows
 *    a "Help mode" badge.
 *  - Otherwise -> POST /public/metric-ai/ask with a sessionId persisted in
 *    localStorage (`metricorex:ask-session`) so a refresh keeps the thread.
 *
 * Human handoff:
 *  - When a reply carries suggestHumanSupport, a highlighted card offers
 *    "Chat with our human support team". The inline form (name + email,
 *    prefilled from the auth profile when available) POSTs /support/escalate
 *    with the full transcript (channel 'webapp_widget'), then the panel
 *    switches to SUPPORT MODE and polls the support desk every 5s
 *    (/support/my/:id/messages when authenticated, /support/guest/:id/messages
 *    + accessKey for guests). The escalated thread is persisted in
 *    localStorage (`metricorex:support-thread`) so a refresh offers a
 *    "Resume support chat" chip.
 */

const METRIC_AI_LOGO = "/icon-192.png"; // square brand mark — the wide wordmark gets cropped to blank inside rounded-full avatar circles
const ASK_PANEL_ANIMATION = "ask-widget-in";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type WidgetEntry =
  | { kind: "msg"; id: string; role: "user" | "assistant"; content: string; imageUrl?: string | null; createdAt: string }
  | { kind: "handoff"; id: string }
  | { kind: "error"; id: string; text: string };

export default function AskMetricAiWidget() {
  const location = useLocation();
  const { toast } = useToast();

  // Hidden on the fullscreen call-room routes (JoinMeeting / JoinCall render
  // VideoCallRoom edge-to-edge there; the Meetings/Calls list pages open the
  // room in a z-50 dialog that covers the widget anyway).
  const onCallRoomRoute = /^\/(meetings|calls)\/[^/]+/i.test(location.pathname || "");

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"ai" | "support">("ai");

  // ---- AI mode state ------------------------------------------------------
  const [entries, setEntries] = useState<WidgetEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [helpMode, setHelpMode] = useState(false);
  const helpModeRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const idCounterRef = useRef(0);

  // ---- Support mode state -------------------------------------------------
  const [supportThread, setSupportThread] = useState<StoredSupportThread | null>(null);
  const supportThreadRef = useRef<StoredSupportThread | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportStatus, setSupportStatus] = useState<SupportThreadStatus | null>(null);
  const [supportSending, setSupportSending] = useState(false);
  const afterCursorRef = useRef("");
  const [resumeThread, setResumeThread] = useState<StoredSupportThread | null>(null);

  // ---- Shared -------------------------------------------------------------
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefillRef = useRef<{ name: string; email: string } | null>(null);

  supportThreadRef.current = supportThread;

  const concluded = mode === "support" && (supportStatus === "resolved" || supportStatus === "closed");

  const nextId = useCallback(() => {
    idCounterRef.current += 1;
    return `ask-widget-${Date.now()}-${idCounterRef.current}`;
  }, []);

  // Load the persisted public-ask session once.
  useEffect(() => {
    sessionIdRef.current = readAskSessionId();
  }, []);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, supportMessages, waiting, supportSending, mode]);

  const appendEntries = useCallback((...items: WidgetEntry[]) => {
    setEntries((prev) => [...prev, ...items]);
  }, []);

  // --------------------------------------------------------------------------
  // Auth profile prefill (name + email) for the escalation form
  // --------------------------------------------------------------------------
  const getAuthPrefill = useCallback(async (): Promise<{ name: string; email: string }> => {
    if (prefillRef.current) return prefillRef.current;
    let name = "";
    let email = "";
    try {
      name = localStorage.getItem("userName") || "";
      email = localStorage.getItem("userEmail") || "";
    } catch {
      /* storage unavailable */
    }
    // Best-effort: the stored "userName" is sometimes the login email, so
    // enrich from the settings profile when we're authenticated.
    if (typeof localStorage !== "undefined" && localStorage.getItem("token")) {
      try {
        const res = await api.get("/settings");
        const body = res?.data || {};
        const profile = body?.profile || body?.data?.profile || null;
        if (profile?.name) name = String(profile.name);
        if (profile?.email) email = String(profile.email);
      } catch {
        /* keep the localStorage values */
      }
    }
    const value = { name, email };
    prefillRef.current = value;
    return value;
  }, []);

  // --------------------------------------------------------------------------
  // Panel open/close — validate any persisted support thread when opening
  // --------------------------------------------------------------------------
  const handleOpen = useCallback(async () => {
    setOpen(true);
    const stored = readStoredSupportThread();
    if (mode !== "ai" || supportThreadRef.current) return;
    if (!stored) {
      setResumeThread(null);
      return;
    }
    // Check whether the stored thread is still open before offering resume.
    try {
      const res = await fetchSupportMessages(stored);
      if (res.status === "resolved" || res.status === "closed") {
        clearStoredSupportThread();
        setResumeThread(null);
      } else {
        setResumeThread(stored);
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        clearStoredSupportThread();
        setResumeThread(null);
      } else {
        // Network/other failure — offer resume anyway (best effort).
        setResumeThread(stored);
      }
    }
  }, [mode]);

  const resumeSupport = useCallback(() => {
    const stored = resumeThread;
    if (!stored) return;
    setResumeThread(null);
    setSupportThread(stored);
    setMode("support");
  }, [resumeThread]);

  const activateSupport = useCallback((result: EscalateSupportResult) => {
    const thread: StoredSupportThread = {
      conversationId: result.conversationId,
      accessKey: result.accessKey,
    };
    writeStoredSupportThread(thread);
    setSupportThread(thread);
    setEntries((prev) => prev.filter((e) => e.kind !== "handoff"));
    setMode("support");
  }, []);

  const resetToAi = useCallback(() => {
    clearStoredSupportThread();
    setSupportThread(null);
    supportThreadRef.current = null;
    setSupportMessages([]);
    setSupportStatus(null);
    afterCursorRef.current = "";
    setResumeThread(null);
    setEntries([]);
    setMode("ai");
  }, []);

  // --------------------------------------------------------------------------
  // Support polling (5s) — active while in support mode
  // --------------------------------------------------------------------------
  const pollSupport = useCallback(async () => {
    const thread = supportThreadRef.current;
    if (!thread) return;
    try {
      const res = await fetchSupportMessages(thread, afterCursorRef.current || undefined);
      setSupportMessages((prev) => mergeSupportMessages(prev, res.messages));
      if (res.messages.length > 0) {
        afterCursorRef.current = res.messages[res.messages.length - 1].created_at;
      }
      setSupportStatus(res.status);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        // Thread vanished server-side — drop the persisted reference.
        clearStoredSupportThread();
        setSupportThread(null);
        supportThreadRef.current = null;
        setResumeThread(null);
        setMode("ai");
        toast({
          title: "Support",
          description: "This support conversation is no longer available.",
        });
      }
      // Transient polling errors are ignored — the next tick retries.
    }
  }, [toast]);

  useEffect(() => {
    if (mode !== "support" || !supportThread) return;
    afterCursorRef.current = "";
    setSupportMessages([]);
    setSupportStatus(null);
    pollSupport();
    const timer = window.setInterval(pollSupport, 5000);
    return () => window.clearInterval(timer);
  }, [mode, supportThread, pollSupport]);

  // --------------------------------------------------------------------------
  // Send — AI mode (authed /ai/chat with public fallback)
  // --------------------------------------------------------------------------
  const buildTranscript = useCallback((): SupportTranscriptTurn[] => {
    return entries
      .filter((e): e is Extract<WidgetEntry, { kind: "msg" }> => e.kind === "msg")
      .map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt }));
  }, [entries]);

  const sendAi = useCallback(async () => {
    const text = draft.trim();
    if (!text || waiting) return;

    appendEntries({ kind: "msg", id: nextId(), role: "user", content: text, createdAt: new Date().toISOString() });
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "0px";
    setWaiting(true);

    try {
      let handled = false;
      const authed = !!localStorage.getItem("token");
      if (authed && !helpModeRef.current) {
        try {
          const result = await sendMetricAiChat(text);
          // Drop any previous handoff card — the newest reply owns it now.
          setEntries((prev) => prev.filter((e) => e.kind !== "handoff"));
          appendEntries({
            kind: "msg",
            id: result.id || nextId(),
            role: "assistant",
            content: result.reply || "",
            imageUrl: result.imageUrl ? resolveMediaUrl(result.imageUrl) : null,
            createdAt: result.createdAt || new Date().toISOString(),
          });
          if (result.suggestHumanSupport) appendEntries({ kind: "handoff", id: nextId() });
          handled = true;
        } catch (err: any) {
          const status = err?.response?.status;
          if (status !== 403 && status !== 401) throw err;
          // Plan-gated (403) or session expired (401): fall back to the
          // public endpoint for the rest of this widget session.
          helpModeRef.current = true;
          setHelpMode(true);
        }
      }
      if (!handled) {
        const res = await askPublicMetricAi(text, sessionIdRef.current);
        if (res.sessionId) {
          sessionIdRef.current = res.sessionId;
          writeAskSessionId(res.sessionId);
        }
        // Drop any previous handoff card — the newest reply owns it now.
        setEntries((prev) => prev.filter((e) => e.kind !== "handoff"));
        appendEntries({
          kind: "msg",
          id: nextId(),
          role: "assistant",
          content: res.reply || "",
          createdAt: new Date().toISOString(),
        });
        if (res.suggestHumanSupport) appendEntries({ kind: "handoff", id: nextId() });
      }
    } catch (err) {
      appendEntries({
        kind: "error",
        id: nextId(),
        text: getApiMessage(err, "MetricAi couldn't answer. Please try again."),
      });
    } finally {
      setWaiting(false);
    }
  }, [draft, waiting, appendEntries, nextId]);

  // --------------------------------------------------------------------------
  // Send — support mode
  // --------------------------------------------------------------------------
  const sendSupport = useCallback(async () => {
    const text = draft.trim();
    const thread = supportThreadRef.current;
    if (!text || supportSending || !thread || concluded) return;
    setSupportSending(true);
    try {
      await sendSupportThreadMessage(thread, text);
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "0px";
      await pollSupport();
    } catch (err) {
      if (getApiErrorCode(err) === "CONVERSATION_CONCLUDED") {
        await pollSupport();
        toast({
          title: "Support",
          description: "Support concluded this chat. Start a new request if you still need help.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Support",
          description: getApiMessage(err, "Could not send your message. Please try again."),
        });
      }
    } finally {
      setSupportSending(false);
    }
  }, [draft, supportSending, concluded, pollSupport, toast]);

  const handleSend = useCallback(() => {
    if (mode === "support") void sendSupport();
    else void sendAi();
  }, [mode, sendSupport, sendAi]);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 110)}px`;
  }, []);

  if (onCallRoomRoute) return null;

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <>
      {/* Floating action button (z-40 — below shadcn modals at z-50) */}
      {!open && (
        <div className="fixed bottom-5 right-5 z-40">
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void handleOpen()}
                  aria-label="Ask MetricAi"
                  className="metric-ai-glow flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#2563EB] shadow-lg transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2"
                >
                  <img src={METRIC_AI_LOGO} alt="" className="h-9 w-9 rounded-full object-cover" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={10}>
                Ask MetricAi
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {open && (
        <>
          {/* Transparent click-catcher: closes the panel on outside click */}
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />

          {/* Chat panel */}
          <div
            role="dialog"
            aria-label="Ask MetricAi"
            className={cn(
              "fixed bottom-5 right-5 z-40 flex w-[380px] max-w-[92vw] h-[520px] max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl",
              ASK_PANEL_ANIMATION,
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 border-b border-border/70 bg-card/90 px-3.5 py-2.5 backdrop-blur-md">
              <span className="metric-ai-glow flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#2563EB] ring-1 ring-indigo-500/40">
                <img src={METRIC_AI_LOGO} alt="" className="h-6 w-6 rounded-full object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {mode === "support" ? "Support" : "MetricAi"}
                  </p>
                  {helpMode && mode === "ai" && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      Help mode
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {mode === "support" ? "Chatting with the support team" : "Ask anything · get help & support"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
                title="Minimize"
                aria-label="Minimize panel"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>

            {mode === "support" ? (
              /* ---------------- SUPPORT MODE ---------------- */
              <>
                <div
                  className={cn(
                    "flex items-center gap-2 border-b px-3.5 py-2 text-xs font-medium",
                    concluded
                      ? "border-border/70 bg-muted/60 text-muted-foreground"
                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  {concluded ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1">Support concluded this chat.</span>
                      <button
                        type="button"
                        onClick={resetToAi}
                        className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
                      >
                        Ask MetricAi again
                      </button>
                    </>
                  ) : (
                    <>
                      <Headset className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                      <span>You are now chatting with Support — replies arrive here.</span>
                    </>
                  )}
                </div>

                <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3 chat-panel-scroll">
                  {supportMessages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                        <Headset className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                      </span>
                      <p className="text-sm font-medium text-foreground/90">Connecting you to Support…</p>
                      <p className="max-w-[240px] text-xs text-muted-foreground">
                        Your MetricAi conversation was shared with our support team. We'll reply here.
                      </p>
                    </div>
                  ) : (
                    supportMessages.map((msg) => (
                      <WidgetSupportBubble key={msg.id} message={msg} />
                    ))
                  )}
                </div>

                <div className="border-t border-border/70 bg-card/90 px-3 py-2.5 backdrop-blur-md">
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 items-end rounded-2xl border border-border/80 bg-muted/60 px-3 py-1.5 transition-all focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/20">
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
                            handleSend();
                          }
                        }}
                        rows={1}
                        disabled={concluded}
                        placeholder={concluded ? "This chat has concluded" : "Reply to Support…"}
                        aria-label="Message support"
                        className="min-h-[36px] max-h-[110px] flex-1 resize-none border-0 bg-transparent px-0 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                      />
                    </div>
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!draft.trim() || supportSending || concluded}
                      className="mb-0.5 h-9 w-9 shrink-0 rounded-xl bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-30"
                      title="Send"
                      aria-label="Send message"
                    >
                      {supportSending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              /* ---------------- AI MODE ---------------- */
              <>
                {/* Resume chip for a persisted, still-open support thread */}
                {resumeThread && (
                  <div className="border-b border-border/70 px-3 py-2">
                    <button
                      type="button"
                      onClick={resumeSupport}
                      className="flex w-full items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-left text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                    >
                      <Headset className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1">Resume support chat</span>
                      <span className="text-[10px] font-normal text-emerald-600/80 dark:text-emerald-400/80">
                        open
                      </span>
                    </button>
                  </div>
                )}

                <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3 chat-panel-scroll">
                  {entries.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2.5 px-4 text-center">
                      <span className="metric-ai-glow flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#2563EB]">
                        <img src={METRIC_AI_LOGO} alt="" className="h-9 w-9 rounded-full object-cover" />
                      </span>
                      <p className="text-sm font-semibold text-foreground/90">Hi, I'm MetricAi</p>
                      <p className="max-w-[260px] text-xs leading-relaxed text-muted-foreground">
                        Ask me anything — help with Metricorex, ideas, or quick answers. If I can't help, I'll
                        connect you with our human support team.
                      </p>
                    </div>
                  ) : (
                    entries.map((entry) => {
                      if (entry.kind === "handoff") {
                        return (
                          <HandoffCard
                            key={entry.id}
                            getPrefill={getAuthPrefill}
                            buildTranscript={buildTranscript}
                            onEscalated={activateSupport}
                          />
                        );
                      }
                      if (entry.kind === "error") {
                        return (
                          <div key={entry.id} className="flex justify-center">
                            <p className="rounded-full bg-destructive/10 px-3 py-1.5 text-[11px] font-medium text-destructive">
                              {entry.text}
                            </p>
                          </div>
                        );
                      }
                      return <WidgetAiBubble key={entry.id} entry={entry} />;
                    })
                  )}
                  {waiting && <WidgetTypingDots />}
                </div>

                <div className="border-t border-border/70 bg-card/90 px-3 py-2.5 backdrop-blur-md">
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 items-end rounded-2xl border border-border/80 bg-muted/60 px-3 py-1.5 transition-all focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/20">
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
                            handleSend();
                          }
                        }}
                        rows={1}
                        placeholder="Ask MetricAi anything…"
                        aria-label="Ask MetricAi"
                        className="min-h-[36px] max-h-[110px] flex-1 resize-none border-0 bg-transparent px-0 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!draft.trim() || waiting}
                      className="metric-ai-glow mb-0.5 h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#2563EB] text-white shadow-sm transition-colors hover:from-[#4338CA] hover:to-[#1D4ED8] disabled:opacity-30"
                      title="Send"
                      aria-label="Send message"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ==========================================
// Sub-components
// ==========================================

function WidgetAiBubble({ entry }: { entry: Extract<WidgetEntry, { kind: "msg" }> }) {
  const isUser = entry.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[82%] flex-col items-end gap-0.5">
          <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-[#4F46E5] to-[#2563EB] px-3.5 py-2 text-white shadow-md shadow-indigo-600/15">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{entry.content}</p>
          </div>
          <span className="text-[10px] text-muted-foreground/70">{formatTime(entry.createdAt)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <span className="metric-ai-glow mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#2563EB]">
        <img src={METRIC_AI_LOGO} alt="" className="h-4 w-4 rounded-full object-cover" />
      </span>
      <div className="flex max-w-[84%] flex-col items-start gap-0.5">
        <div className="rounded-2xl rounded-bl-md border border-border/80 bg-card px-3 py-2 shadow-sm">
          {entry.imageUrl && (
            <img
              src={entry.imageUrl}
              alt="MetricAi generated"
              className="mb-1.5 max-h-40 w-auto max-w-full rounded-xl object-cover"
            />
          )}
          {entry.content ? (
            <MarkdownRenderer content={entry.content} className="text-sm" />
          ) : (
            <p className="text-sm italic text-muted-foreground">(empty reply)</p>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/70">{formatTime(entry.createdAt)}</span>
      </div>
    </div>
  );
}

/** Agent / customer / system bubbles for the widget's support mode. */
function WidgetSupportBubble({ message }: { message: SupportMessage }) {
  if (message.sender_type === "system") {
    return (
      <div className="flex justify-center">
        <p className="max-w-[90%] rounded-full bg-muted/70 px-3 py-1 text-center text-[11px] text-muted-foreground">
          {message.body}
        </p>
      </div>
    );
  }

  const isCustomer = message.sender_type === "customer";
  if (isCustomer) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[82%] flex-col items-end gap-0.5">
          <div className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-primary-foreground shadow-sm">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
          </div>
          <span className="text-[10px] text-muted-foreground/70">{formatTime(message.created_at)}</span>
        </div>
      </div>
    );
  }

  // agent (and any non-system/non-customer sender) renders on the left
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
        <Headset className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      </span>
      <div className="flex max-w-[84%] flex-col items-start gap-0.5">
        <div className="rounded-2xl rounded-bl-md border border-border/80 bg-card px-3 py-2 shadow-sm">
          <p className="mb-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            {message.sender_name || "Support"}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{message.body}</p>
        </div>
        <span className="text-[10px] text-muted-foreground/70">{formatTime(message.created_at)}</span>
      </div>
    </div>
  );
}

/** Inline human-handoff card with a name/email form. */
function HandoffCard({
  getPrefill,
  buildTranscript,
  onEscalated,
}: {
  getPrefill: () => Promise<{ name: string; email: string }>;
  buildTranscript: () => SupportTranscriptTurn[];
  onEscalated: (result: EscalateSupportResult) => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const expand = useCallback(async () => {
    setExpanded(true);
    if (prefilled) return;
    setPrefilled(true);
    try {
      const p = await getPrefill();
      setName((prev) => prev || p.name);
      setEmail((prev) => prev || p.email);
    } catch {
      /* prefill is best-effort */
    }
  }, [getPrefill, prefilled]);

  const submit = useCallback(async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanName || !EMAIL_RE.test(cleanEmail)) {
      toast({
        variant: "destructive",
        title: "Support",
        description: "Please enter your name and a valid email address.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await escalateToSupport({
        name: cleanName,
        email: cleanEmail,
        channel: "webapp_widget",
        subject: "Ask MetricAi handoff",
        transcript: buildTranscript(),
      });
      toast({
        title: "Support request submitted",
        description: "Our support team has been notified. You can chat with them here.",
      });
      onEscalated(result);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Support",
        description: getApiMessage(err, "Could not submit your support request. Please try again."),
      });
    } finally {
      setSubmitting(false);
    }
  }, [name, email, buildTranscript, onEscalated, toast]);

  if (!expanded) {
    return (
      <div className="ml-8 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <Headset className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">Need a human?</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              MetricAi couldn't fully help with this. Our support team can pick it up from here.
            </p>
            <Button
              size="sm"
              onClick={() => void expand()}
              className="mt-2 h-8 rounded-lg bg-emerald-600 px-3 text-xs text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <Headset className="mr-1.5 h-3.5 w-3.5" />
              Chat with our human support team
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ml-8 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
          <Headset className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">Chat with our human support team</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            We'll share this conversation with Support and reply right here.
          </p>
          <div className="mt-2 space-y-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              className="h-8 rounded-lg bg-card text-xs"
              autoComplete="name"
            />
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              aria-label="Your email"
              type="email"
              className="h-8 rounded-lg bg-card text-xs"
              autoComplete="email"
            />
            <div className="flex items-center gap-2 pt-0.5">
              <Button
                size="sm"
                onClick={() => void submit()}
                disabled={submitting}
                className="h-8 rounded-lg bg-emerald-600 px-3 text-xs text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Submit to Support
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExpanded(false)}
                disabled={submitting}
                className="h-8 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WidgetTypingDots() {
  return (
    <div className="flex items-start gap-2">
      <span className="metric-ai-glow mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#2563EB]">
        <img src={METRIC_AI_LOGO} alt="" className="h-4 w-4 rounded-full object-cover" />
      </span>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border/80 bg-card px-3.5 py-2.5 shadow-sm">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
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
