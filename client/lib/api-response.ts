import { AxiosError } from "axios";

type ApiEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

export function getApiMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const data = error.response?.data;

    if (typeof data === "string" && data.trim()) {
      // A stale/old backend or proxy answers with an HTML error page
      // (e.g. "Cannot POST /api/...") — never show raw markup to users.
      if (/<\/?[a-z][\s\S]*>/i.test(data) || /^Cannot (GET|POST|PUT|DELETE|PATCH) /i.test(data.trim())) {
        return friendlyHttpMessage(status, fallback);
      }
      return data;
    }

    if (data && typeof data === "object") {
      const envelope = data as ApiEnvelope;
      return envelope.error || envelope.message || friendlyHttpMessage(status, fallback);
    }

    return friendlyHttpMessage(status, error.message || fallback);
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}

/**
 * Human-friendly copy for bare HTTP statuses. 404 on a NEW endpoint almost
 * always means the API server hasn't been updated yet (deploy lag), which
 * previously surfaced as a confusing raw "Cannot POST ..." message.
 */
function friendlyHttpMessage(status: number | undefined, fallback: string) {
  if (status === 404) {
    return "This feature isn't available on our server yet — we're rolling it out. Please try again shortly.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "Our service is briefly unavailable. Please try again in a moment.";
  }
  return fallback;
}

/**
 * Extract a machine-readable error code from an API error, normalized to
 * UPPER_SNAKE_CASE. The backend has historically used either `errorCode`
 * ('invalid_password') or `code` ('PASSWORD_REQUIRED') with inconsistent
 * casing, which made client-side switch statements unreliable.
 */
export function getApiErrorCode(error: unknown): string {
  let raw: unknown;
  if (error instanceof AxiosError) {
    const data = error.response?.data as Record<string, unknown> | string | undefined;
    if (data && typeof data === "object") {
      raw = data.errorCode ?? data.code;
    }
  } else if (error && typeof error === "object") {
    const data = error as Record<string, unknown>;
    const response = data.response as Record<string, unknown> | undefined;
    const responseData = response?.data as Record<string, unknown> | undefined;
    raw = responseData?.errorCode ?? responseData?.code ?? data.errorCode ?? data.code;
  }
  if (typeof raw !== "string") return '';
  return raw.trim().toUpperCase();
}

export function assertApiSuccess<T extends ApiEnvelope>(
  response: T,
  fallback = "Request failed",
) {
  if (response?.success === false) {
    throw new Error(response.error || response.message || fallback);
  }

  return response;
}

export function unwrapApiData<T>(response: ApiEnvelope<T> | T, fallback = "Request failed") {
  if (
    response &&
    typeof response === "object" &&
    ("success" in response || "data" in response || "error" in response || "message" in response)
  ) {
    const envelope = assertApiSuccess(response as ApiEnvelope<T>, fallback);
    return envelope.data ?? (envelope as T);
  }

  return response as T;
}

export function pickResponseField<T>(
  response: Record<string, unknown>,
  key: string,
  fallback: T,
) {
  const envelope = assertApiSuccess(response);
  const nested = envelope.data;

  if (nested && typeof nested === "object" && key in nested) {
    return (nested as Record<string, unknown>)[key] as T;
  }

  if (key in response) {
    return response[key] as T;
  }

  return fallback;
}
