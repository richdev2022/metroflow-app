import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { AuthResponse, ResendOTPInput } from "@shared/api";

type Step = "login" | "otp";

export default function Login() {
  const navigate = useNavigate();
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

  const handleLogin = async () => {
    setError(null);

    if (!loginData.email || !loginData.password) {
      setError("Email and password are required");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/login", {
        email: loginData.email,
        password: loginData.password,
      });

      const data = response.data as AuthResponse;

      if (data.success) {
        if (data.requiresOtp) {
          setOtpData({ email: loginData.email, otpCode: "" });
          setSuccessMessage(data.message);
          setStep("otp");
        } else if (data.token) {
          localStorage.setItem("token", data.token);
          localStorage.setItem("userId", data.userId || "");
          localStorage.setItem("businessId", data.businessId || "");
          localStorage.setItem("userName", loginData.email);
          setSuccessMessage("Login successful! Redirecting...");
          setTimeout(() => navigate("/dashboard"), 1500);
        }
      } else {
        setError(data.message || "Login failed");
      }
    } catch (err) {
      setError("Failed to login");
      console.error(err);
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
        localStorage.setItem("userName", otpData.email);
        setSuccessMessage("Verified! Redirecting...");
        setTimeout(() => navigate("/dashboard"), 1500);
      } else {
        setError(data.message || "Failed to verify OTP");
      }
    } catch (err) {
      setError("Failed to verify OTP");
      console.error(err);
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
      } else {
        setError(data.message || "Failed to resend OTP");
      }
    } catch (err) {
      setError("Failed to resend OTP");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div 
            className="flex items-center justify-center gap-3 mb-4 cursor-pointer"
            onClick={() => window.location.href = import.meta.env.VITE_SITE_URL}
          >
            <img src="/Assets/logo.png" alt="MetricFlow Logo" className="h-10 w-auto" />
            <span className="font-bold text-xl">MetricFlow</span>
          </div>
          <CardTitle className="text-center">
            {step === "login" ? "Login to Your Account" : "Verify Email"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {step === "login" ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
            >
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@example.com"
                  value={loginData.email}
                  onChange={(e) =>
                    setLoginData({ ...loginData, email: e.target.value })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="password">Password *</Label>
                <PasswordInput
                  id="password"
                  placeholder="••••••••"
                  value={loginData.password}
                  onChange={(e) =>
                    setLoginData({ ...loginData, password: e.target.value })
                  }
                  className="mt-1"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? "Logging in..." : "Login"}
              </Button>

              <div className="space-y-2">
                <p className="text-sm text-center text-muted-foreground">
                  Don't have an account?{" "}
                  <button
                    onClick={() => navigate("/register")}
                    className="text-primary hover:underline font-semibold"
                  >
                    Register here
                  </button>
                </p>
                <p className="text-sm text-center text-muted-foreground">
                  <button
                    onClick={() => navigate("/forgot-password")}
                    className="text-primary hover:underline font-semibold"
                  >
                    Forgot Password?
                  </button>
                </p>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We've sent a 6-digit OTP to <strong>{otpData.email}</strong>
              </p>

              <div>
                <Label htmlFor="otpCode">OTP Code *</Label>
                <Input
                  id="otpCode"
                  placeholder="000000"
                  maxLength={6}
                  value={otpData.otpCode}
                  onChange={(e) =>
                    setOtpData({
                      ...otpData,
                      otpCode: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  className="mt-1 text-center text-2xl tracking-widest"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                OTP expires in 10 minutes
              </p>

              <Button
                onClick={handleVerifyOTP}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Verifying..." : "Verify Email"}
              </Button>

              <Button
                variant="ghost"
                onClick={handleResendOTP}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Sending..." : "Resend OTP"}
              </Button>

              <Button
                variant="outline"
                onClick={() => setStep("login")}
                className="w-full"
              >
                Back
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
