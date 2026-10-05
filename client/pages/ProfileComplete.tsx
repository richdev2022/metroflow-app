import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { assertApiSuccess, getApiMessage } from "@/lib/api-response";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IndustryCombobox } from "@/components/industry-combobox";
import { useToast } from "@/components/ui/use-toast";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { Building2, CheckCircle2, ImagePlus, Loader2 } from "lucide-react";

/**
 * ProfileComplete — SSO onboarding gate (web).
 *
 * Google sign-ups create the workspace with a DERIVED name ("Ada's
 * Workspace"), no industry, no phone number and no logo. The backend answers
 * /auth/google with profileCompleted:false and this screen is the ONLY way
 * forward until the business profile is complete.
 */
export default function ProfileComplete() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [phone, setPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/settings");
        const body = res.data as { success?: boolean; settings?: Record<string, any>; data?: Record<string, any> };
        const profile = body?.settings || body?.data || null;
        if (profile && !cancelled) {
          setName(String(profile.name || ""));
          setIndustry(String(profile.industry || ""));
          setPhone(String(profile.phone_number || profile.phoneNumber || ""));
          setLogoUrl(String(profile.logo_url || profile.logoUrl || ""));
        }
      } catch {
        // Prefill is best-effort — the form still works blank.
      } finally {
        if (!cancelled) {
          setPrefilled(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file for the logo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Logo must be 5 MB or smaller.");
      return;
    }
    setError(null);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Business name is required");
      return;
    }
    if (!industry.trim()) {
      setError("Please select your industry");
      return;
    }
    if (!phone.trim() || phone.trim().length < 7) {
      setError("Enter a valid phone number");
      return;
    }
    if (!logoFile && !logoUrl) {
      setError("Please upload your business logo");
      return;
    }

    setSaving(true);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("industry", industry.trim());
      form.append("phone_number", phone.trim());
      if (logoFile) form.append("logo", logoFile);
      const res = await api.post("/settings/business/complete", form);
      const body = assertApiSuccess(res.data, "Failed to complete profile");
      const completed = (body as { data?: { profileCompleted?: boolean } }).data?.profileCompleted;
      if (completed === false) {
        setError("Profile still incomplete — please fill every field and try again.");
        return;
      }
      toast({ title: "Profile completed", description: "Welcome aboard! Taking you to your dashboard..." });
      setTimeout(() => navigate("/dashboard"), 700);
    } catch (err: any) {
      setError(getApiMessage(err, "Failed to complete profile"));
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    // "Skip for now" — dismiss the prompt server-side so the gate does not
    // re-nag on the next login (profile_prompt_dismissed), then continue to
    // the dashboard. The profile can always be finished from Settings.
    setSaving(true);
    try {
      await api.post("/settings/profile/dismiss");
    } catch {
      // Skipping must never trap the user — server failure is non-blocking.
    } finally {
      setSaving(false);
    }
    navigate("/dashboard");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const shownLogo = logoPreview || (logoUrl ? logoUrl : "");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Complete your profile</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Add your business details to finish setting up your workspace. This takes less than a minute.
          </p>
        </div>

        {prefilled && !name.trim() && (
          <Alert className="mb-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Fill in your real business details below — the placeholder workspace name has been cleared for you.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Logo */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-background transition-colors hover:bg-accent/50"
            >
              {shownLogo ? (
                <img src={shownLogo} alt="Business logo" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-xs">Logo</span>
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoSelected}
            />
            <span className="text-xs text-muted-foreground">Business logo *</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="biz-name">Business name *</Label>
            <Input
              id="biz-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Enterprises Ltd"
              autoComplete="organization"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Industry *</Label>
            <IndustryCombobox value={industry} onChange={setIndustry} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="biz-phone">Phone number *</Label>
            <Input
              id="biz-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 08012345678"
              type="tel"
              autoComplete="tel"
            />
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              "Save & Continue"
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            disabled={saving}
            onClick={handleSkip}
          >
            Skip for now — I'll do it later in Settings
          </Button>
        </form>
      </div>
    </div>
  );
}
