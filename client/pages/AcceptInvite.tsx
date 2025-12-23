import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ApiResponse } from "@shared/api";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false); // For form submission
  const [validationLoading, setValidationLoading] = useState(true); // For token validation
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.password || !formData.confirmPassword) {
      setError("Please fill in all fields");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post(`/team/accept-invite/${token}`, { password: formData.password });
      const data = response.data;

      if (data.success) {
        toast({
          title: "Account activated",
          description: "Your account has been successfully activated. You can now log in.",
        });
        navigate("/login");
      } else {
        setError(data.error || "Failed to activate account");
      }
    } catch (err) {
      setError("Failed to activate account");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setError("Invalid invitation link: Token is missing.");
        setValidationLoading(false);
        return;
      }

      try {
        setValidationLoading(true);
        const response = await api.get(`/team/verify-invite-token/${token}`);
        const data = response.data as ApiResponse<null>;

        if (data.success) {
          setIsTokenValid(true);
          setError(null);
        } else {
          setIsTokenValid(false);
          setError(data.error || "Invalid or expired invitation token.");
        }
      } catch (err) {
        console.error("Token verification error:", err);
        setIsTokenValid(false);
        setError("Failed to verify invitation token. Please try again later.");
      } finally {
        setValidationLoading(false);
      }
      // comment
    };

    verifyToken();
  }, [token]);

  if (validationLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Verifying invitation link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isTokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error || "Invalid or expired invitation link."}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Accept Invitation</CardTitle>
          <p className="text-center text-muted-foreground">
            Set up your password to join the team
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && ( // Display error from form submission or initial validation
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div>
              <Label htmlFor="password">Password *</Label>
              <PasswordInput
                id="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <PasswordInput
                id="confirmPassword"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Activating...
                </>
              ) : "Activate Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}