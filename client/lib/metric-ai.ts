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
  MetricAiUsageResult,
  MetricAiAttachmentResult,
} from "@shared/api";

export type {
  MetricAiStatus,
  MetricAiChatResult,
  MetricAiHistoryMessage,
  MetricAiHistoryResult,
  MetricAiVideoJobResult,
  MetricAiUsageResult,
  MetricAiAttachmentResult,
};

/** GET /ai/status — availability + plan/model info for the UI gate. */
export async function getMetricAiStatus(): Promise<MetricAiStatus> {
  const response = await api.get("/ai/status");
  return unwrapApiData<MetricAiStatus>(response.data, "Failed to load MetricAi status");
}

/**
 * POST /ai/chat { message, imageUrl?, attachmentUrl?, attachmentType? } — one
 * user turn; the server keeps its own 24-message context window and can SEE
 * attached images (OCR/vision) plus extracted video frames. `imageUrl` on the
 * RESULT is present when the assistant GENERATED an image for the ask.
 */
export async function sendMetricAiChat(
  message: string,
  attachment?: { imageUrl?: string; attachmentUrl?: string; attachmentType?: string },
): Promise<MetricAiChatResult> {
  const response = await api.post("/ai/chat", {
    message,
    ...(attachment?.imageUrl ? { imageUrl: attachment.imageUrl } : {}),
    ...(attachment?.attachmentUrl ? { attachmentUrl: attachment.attachmentUrl } : {}),
    ...(attachment?.attachmentType ? { attachmentType: attachment.attachmentType } : {}),
  });
  return unwrapApiData<MetricAiChatResult>(response.data, "MetricAi could not answer");
}

/**
 * POST /ai/attachments — upload an image/video for MetricAi chat (multipart).
 * Returns a persistent URL to pass into sendMetricAiChat as imageUrl
 * (images) or attachmentUrl+attachmentType (videos/files).
 */
export async function uploadMetricAiAttachment(file: File): Promise<MetricAiAttachmentResult> {
  const form = new FormData();
  form.append("file", file);
  const response = await api.post("/ai/attachments", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return unwrapApiData<MetricAiAttachmentResult>(response.data, "Attachment upload failed");
}

/** GET /ai/usage — per-feature daily/monthly usage vs this plan's caps. */
export async function getMetricAiUsage(): Promise<MetricAiUsageResult> {
  const response = await api.get("/ai/usage");
  return unwrapApiData<MetricAiUsageResult>(response.data, "Failed to load MetricAi usage");
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
