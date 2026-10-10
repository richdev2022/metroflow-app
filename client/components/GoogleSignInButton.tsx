import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

declare global {
  interface Window {
    google?: any;
  }
}

// Google Identity Services client ID (set in .env: VITE_GOOGLE_CLIENT_ID).
// When configured we render Google's official button. When not configured the
// button is still shown (consistent CTA) and clicking it surfaces a helpful
// setup notice instead of silently hiding the sign-in option.
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
const GSI_SRC = "https://accounts.google.com/gsi/client";

/** Official Google "G" logo. */
function GoogleG({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.44.35-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

interface GoogleCredentialResponse {
  credential: string;
}

export default function GoogleSignInButton({
  mode = "login",
  referralCode,
}: {
  mode?: "login" | "signup";
  /** Refer & Earn: attach an optional referral code to NEW Google sign-ups. */
  referralCode?: string;
}) {
  const navigate = useNavigate();
  const gsiHostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const handleCredential = async (response: GoogleCredentialResponse) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post("/auth/google", {
        credential: response.credential,
        ...(referralCode ? { referralCode: referralCode.trim().toUpperCase() } : {}),
      });
      const data = res.data as any;

      if (data?.success && data?.token) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("userId", data.userId || "");
        localStorage.setItem("businessId", data.businessId || "");
        localStorage.setItem("userName", data.user?.name || data.user?.email || "");
        if (data.user?.email) {
          localStorage.setItem("userEmail", data.user.email);
        }
        if (data.user?.avatarUrl) {
          localStorage.setItem("userAvatar", data.user.avatarUrl);
        }

        // The backend creates the account automatically for first-time Google
        // users and simply logs in returning ones — tell the user which one
        // happened before landing them on the dashboard.
        const firstName = (data.user?.name || data.user?.email || "there")
          .split(" ")[0];

        // SSO PROFILE-COMPLETION GATE (role-aware): invited team members
        // complete their PERSONAL profile (photo, name, read-only email,
        // phone OTP, skip) via the dashboard modal; business admins complete
        // the BUSINESS profile page. The backend returns both flags.
        if (data.requiresProfileCompletion === true) {
          localStorage.setItem("profileCompleted", "false");
          setSuccess(
            data.isNewUser
              ? `Account created — welcome aboard, ${firstName}! Finish your profile to get started...`
              : `Welcome back, ${firstName}! Finish setting up your profile...`,
          );
          setTimeout(() => navigate("/dashboard"), 900);
          return;
        }
        if (data.profileCompleted === false && data.profilePromptDismissed !== true) {
          localStorage.setItem("profileCompleted", "false");
          setSuccess(
            data.isNewUser
              ? `Account created — welcome aboard, ${firstName}! Add your business details to finish setup...`
              : `Welcome back, ${firstName}! Let's finish setting up your business profile...`,
          );
          setTimeout(() => navigate("/profile-complete"), 900);
          return;
        }

        localStorage.setItem("profileCompleted", "true");
        setSuccess(
          data.isNewUser
            ? `Account created — welcome aboard, ${firstName}! Your workspace is ready. Taking you to your dashboard...`
            : `Welcome back, ${firstName}! Taking you to your dashboard...`,
        );
        setTimeout(() => navigate("/dashboard"), 900);
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

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;

    const renderButton = () => {
      if (cancelled || !window.google?.accounts?.id || !gsiHostRef.current) {
        return;
      }
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredential,
        });
        const width = Math.min(gsiHostRef.current.offsetWidth || 380, 420);
        window.google.accounts.id.renderButton(gsiHostRef.current, {
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
  }, [mode, referralCode]);

  const handleCustomClick = () => {
    setNotice(
      'Google Sign-In is not enabled on this deployment yet. Add VITE_GOOGLE_CLIENT_ID (web app) and GOOGLE_CLIENT_ID (backend) to activate it — see the deployment notes.',
    );
  };

  return (
    <div className="space-y-2">
      <div className="relative flex items-center justify-center py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/70" />
        </div>
        <div className="relative bg-background px-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            or {mode === "signup" ? "sign up" : "sign in"} with
          </span>
        </div>
      </div>

      {GOOGLE_CLIENT_ID ? (
        <div className="flex justify-center" ref={gsiHostRef} />
      ) : (
        <button
          type="button"
          onClick={handleCustomClick}
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-full border border-border bg-background text-sm font-semibold text-foreground shadow-sm transition-all hover:bg-accent/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:opacity-70"
        >
          <GoogleG />
          {mode === "signup" ? "Continue with Google" : "Sign in with Google"}
        </button>
      )}

      {busy && !success && (
        <p className="text-center text-sm text-muted-foreground">
          Signing you in with Google...
        </p>
      )}
      {success && (
        <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <AlertDescription className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
            {success}
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/40">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-xs leading-relaxed text-blue-800 dark:text-blue-300">
            {notice}
          </AlertDescription>
        </Alert>
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
