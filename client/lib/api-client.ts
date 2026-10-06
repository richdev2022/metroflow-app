import axios from "axios";
import { triggerSessionTimeout } from "@/components/SessionTimeoutProvider";
import { triggerUpgradePrompt, isPlanUpgradeError } from "@/components/UpgradePromptProvider";
import {
  isClientEncryptionEnabled,
  looksLikeEncryptedEnvelope,
  encryptPayload,
  decryptPayload,
} from "@/lib/payload-crypto";

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL || "/api").trim(),
  // Hard cap on every request — without it a hung/slow backend response left
  // pages spinning "Loading…" forever (e.g. call/meeting detail pages). Long
  // operations (uploads, AI generation) override this per request.
  timeout: 45_000,
});

const IS_DEV = import.meta.env.DEV;

if (IS_DEV) {
  console.log("API Configured with Base URL:", api.defaults.baseURL);
}

if (!import.meta.env.VITE_API_BASE_URL && import.meta.env.PROD) {
  console.warn("VITE_API_BASE_URL is not set. API calls might fail if backend is not proxied correctly.");
}

api.interceptors.request.use(async (config) => {
  if (IS_DEV) {
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  }
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Add business ID header if it exists
  const businessId = localStorage.getItem("businessId");
  if (businessId) {
    config.headers["x-business-id"] = businessId;
  }
  const userId = localStorage.getItem("userId");
  if (userId) {
    config.headers["x-user-id"] = userId;
  }
  // E2E payload encryption: JSON bodies travel as ciphertext (network-tab
  // safe). FormData/raw uploads and responses to keyless clients stay as-is.
  if (
    isClientEncryptionEnabled() &&
    config.data !== undefined &&
    config.data !== null &&
    !(config.data instanceof FormData) &&
    !(config.data instanceof Blob) &&
    !(config.data instanceof ArrayBuffer) &&
    typeof config.data !== "string" &&
    typeof config.data === "object" &&
    !looksLikeEncryptedEnvelope(config.data)
  ) {
    // Keep the plaintext around so a DECRYPT_FAILED mismatch (client has a
    // key but the backend was deployed without PAYLOAD_ENCRYPTION_KEY) can
    // transparently retry once in plaintext instead of failing the call.
    (config as any)._mfvPlaintext = config.data;
    if ((config as any)._mfvRetryPlaintext === true) {
      // Already retried once in plaintext — send as-is, no header.
      delete config.headers["x-mfv-enc"];
      return config;
    }
    try {
      config.data = await encryptPayload(config.data);
      config.headers["x-mfv-enc"] = "1";
    } catch (err) {
      console.error("[payload-crypto] request encryption failed — sending plaintext:", err);
    }
  }
  return config;
});

api.interceptors.response.use(
  async (response) => {
    // E2E payload encryption: decrypt envelopes before anything downstream
    // reads the body. The ENVELOPE SHAPE is the primary signal — browsers
    // hide custom response headers cross-origin unless the server exposes
    // them (Access-Control-Expose-Headers), so relying on the header alone
    // would leave every response unreadable. Decrypt failure with a visible
    // header is a hard error; without it we pass the body through untouched.
    if (looksLikeEncryptedEnvelope(response.data) && isClientEncryptionEnabled()) {
      const headerEnc = response.headers?.["x-mfv-enc"] === "1";
      try {
        response.data = await decryptPayload(response.data);
      } catch (err) {
        if (headerEnc) {
          console.error("[payload-crypto] response decryption failed:", err);
          return Promise.reject(new Error("Unable to decrypt server response"));
        }
        console.error("[payload-crypto] envelope-shaped body failed to decrypt — passing through:", err);
      }
    }
    // Check if response data is string and starts with < (likely HTML)
    if (typeof response.data === 'string' && response.data.trim().startsWith('<')) {
        console.error("Received HTML response instead of JSON. Check API URL configuration.");
        return Promise.reject(new Error("Invalid API response (HTML received)"));
    }
    // Check for success: false with error: "Invalid or expired token"
    if (response.data && !response.data.success && response.data.error === "Invalid or expired token") {
      triggerSessionTimeout();
      return Promise.reject(new Error("Invalid or expired token"));
    }
    // Plan gate surfaced as a 200-wrapped failure: still show the upgrade modal
    if (response.data && !response.data.success && isPlanUpgradeError(response.data)) {
      triggerUpgradePrompt();
    }
    return response;
  },
  async (error) => {
    // E2E payload encryption on ERROR paths too (4xx/5xx envelopes) — same
    // shape-first detection as the success path (CORS header visibility).
    if (looksLikeEncryptedEnvelope(error.response?.data) && isClientEncryptionEnabled()) {
      const headerEnc = error.response?.headers?.["x-mfv-enc"] === "1";
      try {
        error.response.data = await decryptPayload(error.response.data);
      } catch (err) {
        if (headerEnc) {
          return Promise.reject(new Error("Unable to decrypt server response"));
        }
        console.error("[payload-crypto] error-envelope failed to decrypt — passing through:", err);
      }
    }
    // ENCRYPTION MISMATCH FALLBACK: the client encrypted the body but the
    // server has no PAYLOAD_ENCRYPTION_KEY (400 DECRYPT_FAILED). Retry the
    // exact same request once in plaintext so a half-configured deployment
    // degrades instead of breaking every JSON POST.
    if (
      error.response?.status === 400 &&
      error.response?.data?.code === "DECRYPT_FAILED" &&
      error.config?.headers?.["x-mfv-enc"] === "1" &&
      error.config?._mfvRetryPlaintext !== true
    ) {
      console.warn("[payload-crypto] server rejected the encrypted payload — retrying in plaintext");
      const retryConfig = { ...error.config };
      retryConfig.data = error.config._mfvPlaintext ?? error.config.data;
      retryConfig._mfvRetryPlaintext = true;
      delete retryConfig.headers?.["x-mfv-enc"];
      return api.request(retryConfig);
    }
    // Handle Network Errors (CORS, Offline, Server Down)
    if (error.code === 'ERR_NETWORK') {
        console.error("Network Error: Unable to connect to the server.");
        // Optional: You could trigger a global toast here if you had access to the toast hook
        return Promise.reject(new Error("Unable to connect to the server. Please check your connection or try again later."));
    }

    // Check for success: false with error: "Invalid or expired token" in error response
    if (error.response?.data && !error.response.data.success && error.response.data.error === "Invalid or expired token") {
      triggerSessionTimeout();
      return Promise.reject(error);
    }

    // Plan gate (403 from checkFeaturePermission): surface the global
    // upgrade modal so the user is always offered the upgrade path.
    if (error.response?.status === 403 && isPlanUpgradeError(error.response?.data)) {
      triggerUpgradePrompt();
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      // Handle token expiration
      localStorage.removeItem("token");
      localStorage.removeItem("businessId");
      window.location.href = "/login";
    }

    // Handle custom token expiration/invalid messages
    const errorMessage = error.response?.data?.message || error.response?.data || "";
    const errorString = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : "";
    
    if (errorString.includes("token expires") || errorString.includes("invalid token") || errorString.includes("token expired")) {
       localStorage.removeItem("token");
       localStorage.removeItem("businessId");
       window.location.href = "/login";
       return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);
