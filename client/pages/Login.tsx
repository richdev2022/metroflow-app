import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, Lock, Mail } from "lucide-react";
import { AuthResponse } from "@shared/api";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import AuthShell from "@/components/auth/AuthShell";
import { useCountdown } from "@/hooks/useCountdown";

type Step = "login" | "otp";

export default function Login() {
  const navigate = useNavigate();
  const { seconds, isActive, startCountdown } = useCountdown();
  const [step, setStep] = useState<Step>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  const [otpData, setOtpData] = useState({
    email: "",
    otpCode: "",
  });

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!loginData.email || !loginData.password) {
      setError("Email and password are required");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/login", {
        email: loginData.email.trim(),
        password: loginData.password,
      });

      const data = response.data as AuthResponse;

      if (data.success) {
        if (data.requiresOtp) {
          setOtpData({ email: loginData.email, otpCode: "" });
          setSuccessMessage(data.message);
          setStep("otp");
          startCountdown();
        } else if (data.token) {
          localStorage.setItem("token", data.token);
          localStorage.setItem("userId", data.userId || "");
          localStorage.setItem("businessId", data.businessId || "");
          // Greet the user by NAME — never by their email address. The
          // backend now returns the profile name on every login method;
          // fall back to the email only if the profile has no name yet.
          localStorage.setItem("userName", data.name?.trim() || loginData.email.trim());
          setSuccessMessage("Login successful! Redirecting...");
          setTimeout(() => navigate("/dashboard"), 1200);
        } else {
          setError("Login successful but no token received. Please try again.");
        }
      } else {
        setError(data.message || "Login failed");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setError(null);

    if (!otpData.otpCode) {
      setError("OTP code is required");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/verify-otp", {
        email: otpData.email,
        otpCode: otpData.otpCode,
      });

      const data = response.data as AuthResponse;

      if (data.success && data.token) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("userId", data.userId || "");
        localStorage.setItem("businessId", data.businessId || "");
        localStorage.setItem("userName", data.name?.trim() || otpData.email.trim());
        setSuccessMessage("Verified! Redirecting...");
        setTimeout(() => navigate("/dashboard"), 1200);
      } else {
        setError(data.message || "Failed to verify OTP");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to verify OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError(null);

    try {
      setLoading(true);
      const response = await api.post("/auth/resend-otp", {
        email: otpData.email,
      });

      const data = response.data as AuthResponse;

      if (data.success) {
        setSuccessMessage("OTP sent successfully");
        startCountdown();
      } else {
        setError(data.message || "Failed to resend OTP");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={step === "login" ? "Welcome back" : "Check your inbox"}
      subtitle={
        step === "login"
          ? "Sign in to your workspace to continue."
          : undefined
      }
    >
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="mb-4 border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40">
          <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <AlertDescription className="text-emerald-700 dark:text-emerald-300">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {step === "login" ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={loginData.email}
                onChange={(e) =>
                  setLoginData({ ...loginData, email: e.target.value })
                }
                className="h-11 rounded-xl border-border/70 bg-background/60 pl-10 shadow-sm backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <PasswordInput
                id="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={loginData.password}
                onChange={(e) =>
                  setLoginData({ ...loginData, password: e.target.value })
                }
                className="h-11 rounded-xl border-border/70 bg-background/60 pl-10 shadow-sm backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl border-0 bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:shadow-blue-600/40 hover:brightness-110 active:scale-[0.99]"
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>

          <GoogleSignInButton mode="login" />

          <p className="pt-1 text-center text-sm text-muted-foreground">
            New to MetriCorex?{" "}
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="font-semibold text-primary hover:underline"
            >
              Create an account
            </button>
          </p>
        </form>
      ) : (
        <div className="space-y-5">
          <p className="text-center text-sm text-muted-foreground">
            We sent a 6-digit code to{" "}
            <span className="font-semibold text-foreground">{otpData.email}</span>
          </p>

          <motion.div
            initial={{ scale: 0.97 }}
            animate={{ scale: 1 }}
            className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm backdrop-blur"
          >
            <Label htmlFor="otpCode" className="text-sm font-medium">
              Verification code
            </Label>
            <Input
              id="otpCode"
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
              value={otpData.otpCode}
              onChange={(e) =>
                setOtpData({
                  ...otpData,
                  otpCode: e.target.value.replace(/\D/g, ""),
                })
              }
              className="mt-2 h-14 rounded-xl border-border/70 bg-background/80 text-center text-2xl font-semibold tracking-[0.5em] shadow-sm focus-visible:ring-2 focus-visible:ring-primary/60"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Code expires in 10 minutes.
            </p>
          </motion.div>

          <Button
            onClick={handleVerifyOTP}
            disabled={loading}
            className="h-11 w-full rounded-xl border-0 bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:shadow-blue-600/40 hover:brightness-110 active:scale-[0.99]"
          >
            {loading ? "Verifying..." : "Verify & continue"}
          </Button>

          <div className="flex items-center justify-center gap-4 text-sm">
            <Button
              variant="ghost"
              onClick={handleResendOTP}
              disabled={loading || isActive}
              className="h-auto px-2 py-1 text-muted-foreground hover:text-foreground"
            >
              {loading ? "Sending..." : isActive ? `Resend code in ${seconds}s` : "Resend code"}
            </Button>
            <span className="text-border">|</span>
            <Button
              variant="ghost"
              onClick={() => setStep("login")}
              className="h-auto px-2 py-1 text-muted-foreground hover:text-foreground"
            >
              Back
            </Button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
