import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type {
  GoogleAuthInput,
  GoogleAuthResponse,
  GoogleAuthUser,
} from "@shared/api";

// ---------------------------------------------------------------------------
// Minimal typings for the Google Identity Services (GSI) global namespace.
// Only what this hook needs: initialize + renderButton.
// ---------------------------------------------------------------------------

interface GoogleIdInitializeConfig {
  client_id: string;
  callback?: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
}

interface GoogleCredentialResponse {
  /** Google ID token (JWT) */
  credential?: string;
}

interface GoogleButtonOptions {
  type?: "standard" | "icon";
  theme?: GoogleButtonTheme;
  size?: "large" | "medium" | "small";
  text?: GoogleButtonText;
  shape?: GoogleButtonShape;
  logo_alignment?: "left" | "center";
  width?: number;
  locale?: string;
}

export type GoogleButtonTheme = "outline" | "filled_blue" | "filled_black";
export type GoogleButtonText = "signin_with" | "signup_with" | "continue_with" | "signin";
export type GoogleButtonShape = "rectangular" | "pill" | "circle" | "square";

interface GoogleIdNamespace {
  initialize: (config: GoogleIdInitializeConfig) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
  prompt: () => void;
  disableAutoSelect: () => void;
}

interface GoogleNamespace {
  accounts: {
    id: GoogleIdNamespace;
  };
}

declare global {
  interface Window {
    google?: GoogleNamespace;
  }
}

// ---------------------------------------------------------------------------
// Constants + script loading (loaded once, promise-cached)
// ---------------------------------------------------------------------------

const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

export const GOOGLE_AUTH_NOT_CONFIGURED_ERROR =
  "Google Sign-In is not configured. Set VITE_GOOGLE_CLIENT_ID.";

let gsiScriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Sign-In is only available in the browser."));
  }
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;

  gsiScriptPromise = new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      if (window.google?.accounts?.id) {
        resolve();
      } else {
        gsiScriptPromise = null;
        reject(new Error("Google Identity Services script loaded but did not initialize."));
      }
    };
    const onFailed = () => {
      // Allow a retry on the next mount if the script failed to download.
      gsiScriptPromise = null;
      reject(new Error("Failed to load Google Sign-In. Please check your network and try again."));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${GSI_SCRIPT_SRC}"]`,
    );

    if (existing) {
      // Script tag already inserted (maybe by another integration or a previous load).
      if (existing.dataset.gsiLoaded === "true") {
        onLoaded();
        return;
      }
      existing.addEventListener("load", onLoaded, { once: true });
      existing.addEventListener("error", onFailed, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.gsiLoaded = "true";
      onLoaded();
    };
    script.onerror = onFailed;
    document.head.appendChild(script);
  });

  return gsiScriptPromise;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Exchanges a Google ID token (credential) for an app session.
 * POST /auth/google { credential, ...extra } -> GoogleAuthResponse
 */
export async function googleAuthLogin(
  credential: string,
  extra?: Partial<Pick<GoogleAuthInput, "businessName" | "businessIndustry">>,
): Promise<GoogleAuthResponse> {
  const payload: GoogleAuthInput = { credential, ...extra };
  const response = await api.post<GoogleAuthResponse>("/auth/google", payload);
  return response.data;
}

function extractGoogleAuthErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { message?: unknown; error?: unknown } } })
      .response?.data;
    if (data && typeof data === "object") {
      if (typeof data.message === "string" && data.message.trim()) return data.message;
      if (typeof data.error === "string" && data.error.trim()) return data.error;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Persists a successful Google auth response using the app's existing
 * localStorage session keys (token, userId, businessId, userName) plus the
 * userAvatar and hasPasswordSetup hints.
 */
export function applyGoogleAuthSession(data: GoogleAuthResponse): void {
  try {
    if (data.token) localStorage.setItem("token", data.token);
    localStorage.setItem("userId", data.userId || data.user?.id || "");
    localStorage.setItem("businessId", data.businessId || "");
    const displayName = data.user?.name || data.user?.email || "";
    if (displayName) localStorage.setItem("userName", displayName);
    if (data.user?.avatarUrl) {
      localStorage.setItem("userAvatar", data.user.avatarUrl);
    } else {
      localStorage.removeItem("userAvatar");
    }
    if (data.requiresPasswordSetup) {
      // SSO-only account: hint the rest of the app that a password should be created.
      localStorage.setItem("hasPasswordSetup", "true");
    } else {
      localStorage.removeItem("hasPasswordSetup");
    }
  } catch {
    // localStorage unavailable (private mode etc.) - session simply won't persist.
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface GoogleAuthSuccessResult {
  /** Raw backend response */
  response: GoogleAuthResponse;
  token: string;
  userId: string;
  businessId: string;
  /** True when the account has no password yet and should be prompted to create one */
  requiresPasswordSetup: boolean;
  /** True when this Google account was newly registered */
  isNewUser: boolean;
  user: GoogleAuthUser | null;
}

export interface UseGoogleAuthOptions {
  /** Called after the backend exchange succeeds and the session is persisted */
  onSuccess?: (result: GoogleAuthSuccessResult) => void;
  /** Called on any Google Sign-In failure (script, configuration, or backend) */
  onError?: (message: string) => void;
  theme?: GoogleButtonTheme;
  text?: GoogleButtonText;
  shape?: GoogleButtonShape;
  /** Fixed button width in px; defaults to the container width */
  width?: number;
}

export interface UseGoogleAuthResult {
  /** Attach to a div; the Google button is rendered inside it */
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;
}

export function useGoogleAuth(options: UseGoogleAuthOptions = {}): UseGoogleAuthResult {
  const { theme = "outline", text = "continue_with", shape = "pill", width } = options;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    GOOGLE_CLIENT_ID ? null : GOOGLE_AUTH_NOT_CONFIGURED_ERROR,
  );

  // Keep the latest callbacks/options in a ref so re-renders (e.g. inline
  // arrow-function callbacks) never re-trigger the GSI render effect.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const handleCredentialResponse = useCallback(async (credential: string) => {
    if (!credential) {
      const message = "Google Sign-In returned an empty credential. Please try again.";
      setError(message);
      optionsRef.current.onError?.(message);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await googleAuthLogin(credential);
      if (!data.success || !data.token) {
        const message = data.message || "Google Sign-In failed. Please try again.";
        setError(message);
        optionsRef.current.onError?.(message);
        return;
      }

      applyGoogleAuthSession(data);
      optionsRef.current.onSuccess?.({
        response: data,
        token: data.token,
        userId: data.userId || data.user?.id || "",
        businessId: data.businessId || "",
        requiresPasswordSetup: data.requiresPasswordSetup === true,
        isNewUser: data.isNewUser === true,
        user: data.user ?? null,
      });
    } catch (err) {
      const message = extractGoogleAuthErrorMessage(err, "Google Sign-In failed. Please try again.");
      setError(message);
      optionsRef.current.onError?.(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      // Degrade gracefully: nothing is rendered, onError explains what to do.
      setError(GOOGLE_AUTH_NOT_CONFIGURED_ERROR);
      optionsRef.current.onError?.(GOOGLE_AUTH_NOT_CONFIGURED_ERROR);
      return;
    }

    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled) return;
        const container = containerRef.current;
        const googleId = window.google?.accounts?.id;
        if (!container || !googleId) return;

        googleId.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (credentialResponse) => {
            void handleCredentialResponse(credentialResponse.credential || "");
          },
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });

        // Clear any previously rendered button (StrictMode / re-renders).
        container.innerHTML = "";
        googleId.renderButton(container, {
          type: "standard",
          theme: optionsRef.current.theme ?? "outline",
          size: "large",
          text: optionsRef.current.text ?? "continue_with",
          shape: optionsRef.current.shape ?? "pill",
          logo_alignment: "left",
          width: optionsRef.current.width ?? (container.clientWidth || 320),
        });
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load Google Sign-In. Please try again.";
        setError(message);
        optionsRef.current.onError?.(message);
      });

    return () => {
      cancelled = true;
    };
  }, [handleCredentialResponse, theme, text, shape, width]);

  return {
    containerRef,
    isLoading,
    error,
    isConfigured: Boolean(GOOGLE_CLIENT_ID),
  };
}
