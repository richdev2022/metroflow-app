import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, KeyRound, Mail } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";

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
        setSuccessMessage("Password reset code sent to your email");
        setTimeout(() => navigate("/reset-password-otp", { state: { email } }), 1200);
      } else {
        setError(data.message || "Failed to send reset email");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your work email and we'll send you a reset code."
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

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          handleForgotPassword();
        }}
      >
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5 shadow-sm backdrop-blur">
          <div className="mb-4 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600/15 to-violet-600/15">
              <KeyRound className="h-6 w-6 text-primary" />
            </span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium">
              Email address
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl border-border/70 bg-background/60 pl-10 shadow-sm backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </div>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-xl border-0 bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:shadow-blue-600/40 hover:brightness-110 active:scale-[0.99]"
        >
          {loading ? "Sending..." : "Send reset code"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{" "}
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="font-semibold text-primary hover:underline"
          >
            Back to sign in
          </button>
        </p>
      </form>
    </AuthShell>
  );
}
