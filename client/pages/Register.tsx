import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { AuthResponse } from "@shared/api";
import { IndustryCombobox } from "@/components/industry-combobox";

type Step = "business" | "otp";

export default function Register() {
  const navigate = useNavigate();
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
      setError("Password must be at least 8 characters and contain alphanumeric and symbol characters");
      return;
    }

    if (businessData.password !== businessData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoading(true);
      // Register business
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
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to register business");
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
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to verify OTP");
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
          <div 
            className="flex items-center justify-center gap-3 mb-4 cursor-pointer"
            onClick={() => window.location.href = import.meta.env.VITE_SITE_URL}
          >
            <img src="/Assets/logo.png" alt="MetricFlow Logo" className="h-10 w-auto" />
            <span className="font-bold text-xl">MetricFlow</span>
          </div>
          <CardTitle className="text-center">
            {step === "business" && "Register Business"}
            {step === "otp" && "Verify Email"}
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

          {step === "business" && (
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
                <div className="mt-1">
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
                <div className="mt-2 text-xs space-y-1">
                  <div className={`flex items-center gap-1 ${businessData.password.length >= 8 ? "text-green-600" : "text-muted-foreground"}`}>
                    {businessData.password.length >= 8 ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span>Minimum 8 characters</span>
                  </div>
                  <div className={`flex items-center gap-1 ${/^(?=.*[a-zA-Z])(?=.*[0-9])/.test(businessData.password) ? "text-green-600" : "text-muted-foreground"}`}>
                    {/^(?=.*[a-zA-Z])(?=.*[0-9])/.test(businessData.password) ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span>Alphanumeric (letters & numbers)</span>
                  </div>
                   <div className={`flex items-center gap-1 ${/[^a-zA-Z0-9]/.test(businessData.password) ? "text-green-600" : "text-muted-foreground"}`}>
                    {/[^a-zA-Z0-9]/.test(businessData.password) ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span>Contains a symbol</span>
                  </div>
                </div>
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

              <div className="flex gap-4">
                <Button
                  onClick={handleRegisterBusiness}
                  loading={loading}
                  className="w-full"
                >
                  Create Account
                </Button>
              </div>

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
          )}

          {step === "otp" && (
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
