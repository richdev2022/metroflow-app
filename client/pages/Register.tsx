import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle,
  Building2,
  CheckCircle,
  FileText,
  Lock,
  Mail,
  User,
  XCircle,
} from "lucide-react";
import { AuthResponse } from "@shared/api";
import { IndustryCombobox } from "@/components/industry-combobox";
import { useCountdown } from "@/hooks/useCountdown";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import AuthShell from "@/components/auth/AuthShell";

type Step = "business" | "otp";

const inputClass =
  "h-11 rounded-xl border-border/70 bg-background/60 pl-10 shadow-sm backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-primary/60";

export default function Register() {
  const navigate = useNavigate();
  const { seconds, isActive, startCountdown } = useCountdown();
  const [step, setStep] = useState<Step>("business");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Business Data State
  const [businessData, setBusinessData] = useState({
    businessName: "",
    businessEmail: "",
    businessIndustry: "",
    adminName: "",
    adminEmail: "",
    password: "",
    confirmPassword: "",
  });

  // OTP Data State
  const [otpData, setOtpData] = useState({
    email: "",
    otpCode: "",
  });

  const handleRegisterBusiness = async () => {
    setError(null);

    if (
      !businessData.businessName ||
      !businessData.businessEmail ||
      !businessData.adminName ||
      !businessData.adminEmail ||
      !businessData.password
    ) {
      setError("All fields are required");
      return;
    }

    // Password complexity validation
    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,}$/;
    if (!passwordRegex.test(businessData.password)) {
      setError(
        "Password must be at least 8 characters and contain alphanumeric and symbol characters",
      );
      return;
    }

    if (businessData.password !== businessData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/register", {
        businessName: businessData.businessName,
        businessEmail: businessData.businessEmail,
        businessIndustry: businessData.businessIndustry || undefined,
        adminName: businessData.adminName,
        adminEmail: businessData.adminEmail,
        password: businessData.password,
      });

      const data = response.data as AuthResponse;

      if (data.success) {
        setOtpData({ email: businessData.adminEmail, otpCode: "" });
        setSuccessMessage(data.message);
        setStep("otp");
        startCountdown();
      } else {
        setError(data.message || "Registration failed");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to register business");
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
        localStorage.setItem("userName", businessData.adminName);
        setSuccessMessage("Email verified! Redirecting...");
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
      const response = await api.post("/auth/resend-otp", { email: otpData.email });

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

  const checks = [
    {
      ok: businessData.password.length >= 8,
      label: "Minimum 8 characters",
    },
    {
      ok: /^(?=.*[a-zA-Z])(?=.*[0-9])/.test(businessData.password),
      label: "Alphanumeric (letters & numbers)",
    },
    {
      ok: /[^a-zA-Z0-9]/.test(businessData.password),
      label: "Contains a symbol",
    },
  ];

  return (
    <AuthShell
      wide
      title={step === "business" ? "Create your workspace" : "Verify your email"}
      subtitle={
        step === "business"
          ? "Start your 7-day free trial. No credit card required."
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

      {step === "business" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleRegisterBusiness();
          }}
        >
          <div className="rounded-2xl border border-border/60 bg-card/50 p-4 shadow-sm backdrop-blur sm:p-5">
            <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 text-primary" /> Company
            </p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="businessName" className="text-sm font-medium">
                  Business name
                </Label>
                <Input
                  id="businessName"
                  placeholder="Acme Ltd"
                  value={businessData.businessName}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      businessName: e.target.value,
                    })
                  }
                  className={inputClass}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="businessEmail" className="text-sm font-medium">
                    Business email
                  </Label>
                  <Input
                    id="businessEmail"
                    type="email"
                    placeholder="hello@acme.com"
                    value={businessData.businessEmail}
                    onChange={(e) =>
                      setBusinessData({
                        ...businessData,
                        businessEmail: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Industry</Label>
                  <IndustryCombobox
                    value={businessData.businessIndustry}
                    onChange={(value) =>
                      setBusinessData({
                        ...businessData,
                        businessIndustry: value,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/50 p-4 shadow-sm backdrop-blur sm:p-5">
            <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <User className="h-3.5 w-3.5 text-primary" /> Administrator
            </p>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="adminName" className="text-sm font-medium">
                    Full name
                  </Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="adminName"
                      placeholder="Ada Obi"
                      value={businessData.adminName}
                      onChange={(e) =>
                        setBusinessData({
                          ...businessData,
                          adminName: e.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adminEmail" className="text-sm font-medium">
                    Work email
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="adminEmail"
                      type="email"
                      autoComplete="email"
                      placeholder="ada@acme.com"
                      value={businessData.adminEmail}
                      onChange={(e) =>
                        setBusinessData({
                          ...businessData,
                          adminEmail: e.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <PasswordInput
                    id="password"
                    placeholder="Create a strong password"
                    value={businessData.password}
                    onChange={(e) =>
                      setBusinessData({
                        ...businessData,
                        password: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-1 gap-1 pt-1 text-xs sm:grid-cols-3">
                  {checks.map((c) => (
                    <div
                      key={c.label}
                      className={`flex items-center gap-1.5 ${
                        c.ok
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {c.ok ? (
                        <CheckCircle className="h-3 w-3 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 shrink-0" />
                      )}
                      <span>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm password
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <PasswordInput
                    id="confirmPassword"
                    placeholder="Re-enter your password"
                    value={businessData.confirmPassword}
                    onChange={(e) =>
                      setBusinessData({
                        ...businessData,
                        confirmPassword: e.target.value,
                      })
                    }
                    className={`${inputClass} ${
                      businessData.confirmPassword &&
                      businessData.confirmPassword !== businessData.password
                        ? "border-red-400 focus-visible:ring-red-400/50"
                        : ""
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl border-0 bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:shadow-blue-600/40 hover:brightness-110 active:scale-[0.99]"
          >
            {loading ? "Creating account..." : "Create account"}
          </Button>

          <GoogleSignInButton mode="signup" />

          <p className="pt-1 text-center text-xs leading-relaxed text-muted-foreground">
            By creating an account you agree to our{" "}
            <span className="font-medium text-foreground">Terms of Service</span>{" "}
            and{" "}
            <span className="font-medium text-foreground">Privacy Policy</span>.
          </p>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="font-semibold text-primary hover:underline"
            >
              Sign in
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
            <Label htmlFor="otpCode" className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-primary" /> Verification code
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
              onClick={() => setStep("business")}
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
