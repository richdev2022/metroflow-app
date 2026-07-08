import { AxiosError } from "axios";

type ApiEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

export function getApiMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const data = error.response?.data;

    if (typeof data === "string" && data.trim()) {
      return data;
    }

    if (data && typeof data === "object") {
      const envelope = data as ApiEnvelope;
      return envelope.error || envelope.message || fallback;
    }

    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
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
