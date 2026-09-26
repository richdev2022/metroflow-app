import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

declare global {
  interface Window {
    google?: any;
  }
}

// Google Identity Services client ID (set in .env: VITE_GOOGLE_CLIENT_ID).
// When it is not configured the button renders nothing so the auth pages
// degrade gracefully to email + password only.
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
const GSI_SRC = "https://accounts.google.com/gsi/client";

interface GoogleCredentialResponse {
  credential: string;
}

export default function GoogleSignInButton({
  mode = "login",
}: {
  mode?: "login" | "signup";
}) {
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;

    const handleCredential = async (response: GoogleCredentialResponse) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await api.post("/auth/google", {
          credential: response.credential,
        });
        const data = res.data as any;

        if (data?.success && data?.token) {
          localStorage.setItem("token", data.token);
          localStorage.setItem("userId", data.userId || "");
          localStorage.setItem("businessId", data.businessId || "");
          localStorage.setItem("userName", data.user?.name || data.user?.email || "");
          if (data.user?.avatarUrl) {
            localStorage.setItem("userAvatar", data.user.avatarUrl);
          }
          setTimeout(() => navigate("/dashboard"), 600);
        } else {
          setError(data?.message || "Google sign-in failed. Please try again.");
        }
      } catch (err: any) {
        setError(
          err?.response?.data?.message ||
            "Google sign-in failed. Please try again.",
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    };

    const renderButton = () => {
      if (cancelled || !window.google?.accounts?.id || !buttonRef.current) {
        return;
      }
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredential,
        });
        const width = Math.min(buttonRef.current.offsetWidth || 320, 400);
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: mode === "signup" ? "signup_with" : "signin_with",
          shape: "pill",
          logo_alignment: "left",
          width: String(width),
        });
      } catch (e) {
        console.error("Failed to render Google Sign-In button:", e);
      }
    };

    // Load the GSI script once, then render the button
    if (window.google?.accounts?.id) {
      renderButton();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${GSI_SRC}"]`,
      );
      const script = existing || document.createElement("script");
      if (!existing) {
        script.src = GSI_SRC;
        script.async = true;
        script.defer = true;
        script.onload = renderButton;
        document.head.appendChild(script);
      } else {
        script.addEventListener("load", renderButton);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [mode, navigate]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="space-y-2">
      <div className="relative flex items-center justify-center py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative bg-background px-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            or {mode === "signup" ? "sign up" : "sign in"} with
          </span>
        </div>
      </div>
      <div className="flex justify-center" ref={buttonRef} />
      {busy && (
        <p className="text-center text-sm text-muted-foreground">
          Signing you in with Google...
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
