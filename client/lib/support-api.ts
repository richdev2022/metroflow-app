/**
 * Support desk + public "Ask MetricAi" API wrappers.
 *
 * Support flow (server: server/routes/support.ts):
 *  1. MetricAi (page or widget) flags `suggestHumanSupport` on a reply.
 *  2. The client collects name + email and POSTs the transcript to
 *     POST /support/escalate -> creates a support conversation and notifies
 *     every support agent. Guests (no bearer) receive an `accessKey` that must
 *     be kept to read/reply; authenticated callers are attached to their user.
 *  3. Customer + agent chat (polling friendly via the `?after=` cursor) until
 *     the conversation is resolved/closed ("concluded").
 *
 * Message shape (snake_case, straight from the support_messages table):
 *   { id, sender_type: 'customer'|'agent'|'system'|'ai', sender_name, body, meta?, created_at }
 */
import { api } from "@/lib/api-client";
import { unwrapApiData } from "@/lib/api-response";

// ==========================================
// Types
// ==========================================

export type SupportSenderType = "customer" | "agent" | "system" | "ai";
export type SupportThreadStatus = "open" | "pending" | "resolved" | "closed";

export interface SupportMessage {
  id: string;
  sender_type: SupportSenderType;
  sender_name: string | null;
  body: string;
  meta?: Record<string, unknown> | null;
  created_at: string;
}

export interface SupportTranscriptTurn {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface EscalateSupportInput {
  name: string;
  email: string;
  subject?: string;
  /** Extra first customer message (optional; the transcript is attached separately). */
  message?: string;
  channel: "metric_ai" | "webapp_widget" | "website_widget" | "mobile";
  transcript?: SupportTranscriptTurn[];
}

export interface EscalateSupportResult {
  conversationId: string;
  /** Present ONLY when the caller is unauthenticated (guest) — needed to chat. */
  accessKey: string | null;
  status: SupportThreadStatus;
}

export interface SupportMessagesResult {
  messages: SupportMessage[];
  status: SupportThreadStatus;
}

/** A stored support thread reference (localStorage) so a refresh can resume. */
export interface StoredSupportThread {
  conversationId: string;
  /** null for authenticated escalations (backend only issues keys to guests). */
  accessKey: string | null;
}

export interface PublicAskResult {
  reply: string;
  sessionId: string;
  suggestHumanSupport: boolean;
}

// ==========================================
// Public "Ask MetricAi" (no auth)
// ==========================================

/**
 * POST /public/metric-ai/ask { message, sessionId? } — public, rate-limited
 * per IP (429) and 503 when the AI is not configured server-side.
 */
export async function askPublicMetricAi(message: string, sessionId?: string | null): Promise<PublicAskResult> {
  const response = await api.post("/public/metric-ai/ask", {
    message,
    ...(sessionId ? { sessionId } : {}),
  });
  return unwrapApiData<PublicAskResult>(response.data, "MetricAi could not answer");
}

// ==========================================
// Escalation (public, optional bearer)
// ==========================================

/**
 * POST /support/escalate — hands a MetricAi conversation to human support.
 * Uses the shared axios instance so an authenticated caller's bearer token is
 * attached automatically (guests simply have no token). `accessKey` is
 * returned only for guests.
 */
export async function escalateToSupport(input: EscalateSupportInput): Promise<EscalateSupportResult> {
  const response = await api.post("/support/escalate", {
    name: input.name,
    email: input.email,
    subject: input.subject || undefined,
    message: input.message || undefined,
    channel: input.channel,
    transcript: input.transcript || undefined,
  });
  const data = unwrapApiData<EscalateSupportResult>(response.data, "Failed to submit your support request");
  return {
    conversationId: String(data.conversationId || ""),
    accessKey: data.accessKey ? String(data.accessKey) : null,
    status: (data.status as SupportThreadStatus) || "open",
  };
}

// ==========================================
// Support chat — authenticated customers (/support/my/*)
// ==========================================

/** GET /support/my/conversations — the caller's support conversations. */
export async function getMySupportConversations(): Promise<unknown[]> {
  const response = await api.get("/support/my/conversations");
  const data = unwrapApiData<{ conversations?: unknown[] }>(response.data, "Failed to load support conversations");
  return data.conversations || [];
}

/** GET /support/my/:id/messages?after= — poll-friendly message fetch. */
export async function getMySupportMessages(conversationId: string, after?: string): Promise<SupportMessagesResult> {
  const response = await api.get(`/support/my/${conversationId}/messages`, {
    params: after ? { after } : undefined,
  });
  return unwrapApiData<SupportMessagesResult>(response.data, "Failed to load support messages");
}

/** POST /support/my/:id/messages { body } — customer reply. */
export async function postMySupportMessage(conversationId: string, body: string): Promise<void> {
  await api.post(`/support/my/${conversationId}/messages`, { body });
}

/** POST /support/my/:id/close — customer concludes the conversation. */
export async function closeMySupportConversation(conversationId: string): Promise<void> {
  await api.post(`/support/my/${conversationId}/close`);
}

// ==========================================
// Support chat — guests (/support/guest/*, authorized by accessKey)
// ==========================================

/** GET /support/guest/:id/messages?key=&after= — guest message fetch. */
export async function getGuestSupportMessages(
  conversationId: string,
  accessKey: string,
  after?: string,
): Promise<SupportMessagesResult> {
  const response = await api.get(`/support/guest/${conversationId}/messages`, {
    params: { key: accessKey, ...(after ? { after } : {}) },
  });
  return unwrapApiData<SupportMessagesResult>(response.data, "Failed to load support messages");
}

/** POST /support/guest/:id/messages { body, key } — guest reply. */
export async function postGuestSupportMessage(
  conversationId: string,
  accessKey: string,
  body: string,
): Promise<void> {
  await api.post(`/support/guest/${conversationId}/messages`, { body, key: accessKey });
}

// ==========================================
// Shared helpers
// ==========================================

/** Fetch support messages via the right endpoint for a stored thread. */
export function fetchSupportMessages(
  thread: StoredSupportThread,
  after?: string,
): Promise<SupportMessagesResult> {
  return thread.accessKey
    ? getGuestSupportMessages(thread.conversationId, thread.accessKey, after)
    : getMySupportMessages(thread.conversationId, after);
}

/** Send a support message via the right endpoint for a stored thread. */
export function sendSupportThreadMessage(thread: StoredSupportThread, body: string): Promise<void> {
  return thread.accessKey
    ? postGuestSupportMessage(thread.conversationId, thread.accessKey, body)
    : postMySupportMessage(thread.conversationId, body);
}

// ==========================================
// localStorage persistence
// ==========================================

const SUPPORT_THREAD_KEY = "metricorex:support-thread";
const ASK_SESSION_KEY = "metricorex:ask-session";
/** MetricAi page (authenticated) keeps its own reference for the strip. */
const METRIC_AI_SUPPORT_KEY = "metricorex:metric-ai-support";

export function readStoredSupportThread(key: string = SUPPORT_THREAD_KEY): StoredSupportThread | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSupportThread;
    if (!parsed || typeof parsed.conversationId !== "string" || !parsed.conversationId) return null;
    return { conversationId: parsed.conversationId, accessKey: parsed.accessKey || null };
  } catch {
    return null;
  }
}

export function writeStoredSupportThread(thread: StoredSupportThread, key: string = SUPPORT_THREAD_KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify(thread));
  } catch {
    /* storage unavailable — resume just won't work */
  }
}

export function clearStoredSupportThread(key: string = SUPPORT_THREAD_KEY): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readAskSessionId(): string | null {
  try {
    return localStorage.getItem(ASK_SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function writeAskSessionId(sessionId: string): void {
  try {
    localStorage.setItem(ASK_SESSION_KEY, sessionId);
  } catch {
    /* ignore */
  }
}

export { METRIC_AI_SUPPORT_KEY, SUPPORT_THREAD_KEY, ASK_SESSION_KEY };
