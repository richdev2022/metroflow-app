import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { useCountdown } from "@/hooks/useCountdown";

export default function ResetPasswordOtp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { seconds, isActive, startCountdown } = useCountdown();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const email = location.state?.email || "";

  useEffect(() => {
    if (!email) {
      navigate("/forgot-password");
    }
  }, [email, navigate]);

  const [otpCode, setOtpCode] = useState("");

  const handleVerifyOTP = async () => {
    setError(null);

    if (!otpCode) {
      setError("OTP code is required");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/verify-reset-otp", { email, otpCode });
      const data = response.data;

      if (data.success) {
        setSuccessMessage("OTP verified successfully");
        setTimeout(() => navigate("/reset-password", { state: { email, otpCode } }), 1500);
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
      const response = await api.post("/auth/forgot-password", { email });
      const data = response.data;

      if (data.success) {
        setSuccessMessage("New OTP sent to your email");
        startCountdown();
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
          <CardTitle className="text-center">Verify Reset Code</CardTitle>
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

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We've sent a 6-digit OTP to <strong>{email}</strong>
            </p>

            <div>
              <Label htmlFor="otpCode">OTP Code *</Label>
              <Input
                id="otpCode"
                placeholder="000000"
                maxLength={6}
                value={otpCode}
                onChange={(e) =>
                  setOtpCode(e.target.value.replace(/\D/g, ""))
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
              {loading ? "Verifying..." : "Verify Code"}
            </Button>

            <Button
              variant="ghost"
              onClick={handleResendOTP}
              disabled={loading || isActive}
              className="w-full"
            >
              {loading ? "Sending..." : isActive ? `Resend Code in ${seconds}s` : "Resend Code"}
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate("/forgot-password")}
              className="w-full"
            >
              Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}