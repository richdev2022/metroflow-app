import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [email, setEmail] = useState("");

  const handleForgotPassword = async () => {
    setError(null);

    if (!email) {
      setError("Email is required");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/forgot-password", { email });
      const data = response.data;

      if (data.success) {
        setSuccessMessage("Password reset OTP sent to your email");
        setTimeout(() => navigate("/reset-password-otp", { state: { email } }), 1500);
      } else {
        setError(data.message || "Failed to send reset email");
      }
    } catch (err) {
      setError("Failed to send reset email");
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
          <CardTitle className="text-center">Reset Your Password</CardTitle>
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
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>

            <Button
              onClick={handleForgotPassword}
              disabled={loading}
              className="w-full"
            >
              {loading ? "Sending..." : "Send Reset Code"}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              Remember your password?{" "}
              <button
                onClick={() => navigate("/login")}
                className="text-primary hover:underline font-semibold"
              >
                Back to Login
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}