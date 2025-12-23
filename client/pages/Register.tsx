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

type Step = "business" | "otp";

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("business");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [businessData, setBusinessData] = useState({
    businessName: "",
    businessEmail: "",
    businessIndustry: "",
    adminName: "",
    adminEmail: "",
    password: "",
    confirmPassword: "",
  });

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

    if (businessData.password !== businessData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (businessData.password.length < 6) {
      setError("Password must be at least 6 characters");
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
      } else {
        setError(data.message || "Registration failed");
      }
    } catch (err) {
      setError("Failed to register business");
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
        localStorage.setItem("userName", businessData.adminName);
        setSuccessMessage("Email verified! Redirecting...");
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
      const response = await api.post("/auth/resend-otp", { email: otpData.email });

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
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src="/Assets/logo.png" alt="MetricFlow Logo" className="h-10 w-auto" />
            <span className="font-bold text-xl">MetricFlow</span>
          </div>
          <CardTitle className="text-center">
            {step === "business" ? "Register Your Business" : "Verify Email"}
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

          {step === "business" ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="businessName">Business Name *</Label>
                <Input
                  id="businessName"
                  placeholder="Your Business Name"
                  value={businessData.businessName}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      businessName: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="businessEmail">Business Email *</Label>
                <Input
                  id="businessEmail"
                  type="email"
                  placeholder="business@example.com"
                  value={businessData.businessEmail}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      businessEmail: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="businessIndustry">Industry</Label>
                <Input
                  id="businessIndustry"
                  placeholder="e.g., Technology, Finance, etc."
                  value={businessData.businessIndustry}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      businessIndustry: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <hr className="my-4" />

              <div>
                <Label htmlFor="adminName">Admin Name *</Label>
                <Input
                  id="adminName"
                  placeholder="Your Full Name"
                  value={businessData.adminName}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      adminName: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="adminEmail">Admin Email *</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="admin@example.com"
                  value={businessData.adminEmail}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      adminEmail: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="password">Password *</Label>
                <PasswordInput
                  id="password"
                  placeholder="••••••••"
                  value={businessData.password}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      password: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="••••••••"
                  value={businessData.confirmPassword}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      confirmPassword: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <Button
                onClick={handleRegisterBusiness}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Creating Account..." : "Create Account"}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{" "}
                <button
                  onClick={() => navigate("/login")}
                  className="text-primary hover:underline font-semibold"
                >
                  Login here
                </button>
              </p>
            </div>
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
                onClick={() => setStep("business")}
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
