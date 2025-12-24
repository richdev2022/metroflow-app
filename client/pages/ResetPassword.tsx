import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const email = location.state?.email || "";
  const otpCode = location.state?.otpCode || "";

  useEffect(() => {
    if (!email || !otpCode) {
      navigate("/forgot-password");
    }
  }, [email, otpCode, navigate]);

  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  const handleResetPassword = async () => {
    setError(null);

    if (!passwordData.newPassword || !passwordData.confirmPassword) {
      setError("Both password fields are required");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/reset-password", {
        email,
        otpCode,
        newPassword: passwordData.newPassword,
      });

      const data = response.data;

      if (data.success) {
        setSuccessMessage("Password reset successfully! Redirecting to login...");
        setTimeout(() => navigate("/login"), 2000);
      } else {
        setError(data.message || "Failed to reset password");
      }
    } catch (err) {
      setError("Failed to reset password");
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
          <CardTitle className="text-center">Set New Password</CardTitle>
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
            <div>
              <Label htmlFor="newPassword">New Password *</Label>
              <PasswordInput
                id="newPassword"
                placeholder="••••••••"
                value={passwordData.newPassword}
                onChange={(e) =>
                  setPasswordData({ ...passwordData, newPassword: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm New Password *</Label>
              <PasswordInput
                id="confirmPassword"
                placeholder="••••••••"
                value={passwordData.confirmPassword}
                onChange={(e) =>
                  setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <Button
              onClick={handleResetPassword}
              disabled={loading}
              className="w-full"
            >
              {loading ? "Resetting..." : "Reset Password"}
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate("/reset-password-otp", { state: { email } })}
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