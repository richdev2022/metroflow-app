/**
 * MetricAi API wrappers (server routes: /ai/*).
 *
 * All endpoints require the bearer token (attached by the shared axios
 * instance's request interceptor) and are plan-gated server-side:
 * a 403 with body code `metric_ai_not_enabled` means the caller's plan does
 * not include MetricAi (upgradeRequired: true).
 */
import { api } from "@/lib/api-client";
import { unwrapApiData } from "@/lib/api-response";
import type {
  MetricAiStatus,
  MetricAiChatResult,
  MetricAiHistoryMessage,
  MetricAiHistoryResult,
  MetricAiVideoJobResult,
} from "@shared/api";

export type {
  MetricAiStatus,
  MetricAiChatResult,
  MetricAiHistoryMessage,
  MetricAiHistoryResult,
  MetricAiVideoJobResult,
};

/** GET /ai/status — availability + plan/model info for the UI gate. */
export async function getMetricAiStatus(): Promise<MetricAiStatus> {
  const response = await api.get("/ai/status");
  return unwrapApiData<MetricAiStatus>(response.data, "Failed to load MetricAi status");
}

/**
 * POST /ai/chat { message } — one user turn; the server keeps its own
 * 24-message context window. `imageUrl` is present when the assistant
 * generated an image (e.g. the user asked "generate an image of …").
 */
export async function sendMetricAiChat(message: string): Promise<MetricAiChatResult> {
  const response = await api.post("/ai/chat", { message });
  return unwrapApiData<MetricAiChatResult>(response.data, "MetricAi could not answer");
}

/** GET /ai/history?page=&limit= — newest-last list of previous turns. */
export async function getMetricAiHistory(page = 1, limit = 50): Promise<MetricAiHistoryResult> {
  const response = await api.get("/ai/history", { params: { page, limit } });
  return unwrapApiData<MetricAiHistoryResult>(response.data, "Failed to load MetricAi history");
}

/** DELETE /ai/history — wipes the server-side history for the caller. */
export async function clearMetricAiHistory(): Promise<void> {
  await api.delete("/ai/history");
}

/**
 * GET /ai/video/{jobId} — poll an async MetricAi video job while it is
 * "processing". On success videoUrl points at our own storage (never expires).
 */
export async function getMetricAiVideoJob(jobId: string): Promise<MetricAiVideoJobResult> {
  const response = await api.get(`/ai/video/${encodeURIComponent(jobId)}`);
  return unwrapApiData<MetricAiVideoJobResult>(response.data, "Failed to load video status");
}
