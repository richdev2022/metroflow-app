import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { assertApiSuccess, getApiMessage } from "@/lib/api-response";
import { KycStatus } from "@shared/api";
import { normalizeKycStatus } from "@/lib/kyc-utils";
import { resolveMediaUrl } from "@/lib/media-url";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  Camera,
  Mail,
  Phone,
  Briefcase,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Lock,
  CheckCircle2,
  Circle,
  XCircle,
  ArrowRight,
  BadgeCheck,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OwnProfile {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
  status?: string | null;
  jobTitle?: string | null;
  department?: string | null;
}

type KycLevel = "unverified" | "pending" | "verified" | "rejected";

const ROLE_BADGE_STYLES: Record<string, string> = {
  admin: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  manager: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  member: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};

const LEVEL_CONFIG: Record<KycLevel, { label: string; classes: string; icon: React.ReactNode }> = {
  verified: {
    label: "Verified",
    classes: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: <BadgeCheck className="h-3.5 w-3.5" />,
  },
  pending: {
    label: "Pending",
    classes: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  rejected: {
    label: "Rejected",
    classes: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  unverified: {
    label: "Unverified",
    classes: "bg-muted text-muted-foreground border-border",
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
  },
};

function initialsOf(name: string): string {
  const trimmed = (name || "?").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.substring(0, 2).toUpperCase();
}

export default function Profile() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // KYC + security status
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);
  const [otpEnabled, setOtpEnabled] = useState<boolean | null>(null);
  const [pinCreated, setPinCreated] = useState<boolean | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, kycRes, otpRes] = await Promise.all([
        api.get("/settings"),
        api.get("/kyc/status").catch(() => null),
        api.get("/settings/otp-enabled").catch(() => null),
      ]);

      // GET /settings -> { success, settings: {...business}, profile: {...me} }
      const body = assertApiSuccess(settingsRes.data, "Failed to fetch profile");
      const me = (body as { profile?: OwnProfile }).profile || null;
      setProfile(me);
      setName(me?.name || localStorage.getItem("userName") || "");
      setPhone(me?.phone_number || "");
      const resolvedAvatar = resolveMediaUrl(me?.avatarUrl || localStorage.getItem("userAvatar") || "");
      setAvatarUrl(resolvedAvatar);
      if (resolvedAvatar) {
        try { localStorage.setItem("userAvatar", resolvedAvatar); } catch { /* ignore */ }
      }

      if (kycRes) setKycStatus(normalizeKycStatus(kycRes.data));

      if (otpRes) {
        const otpBody = assertApiSuccess(otpRes.data, "Failed to get OTP status");
        setOtpEnabled(Boolean((otpBody as { otpEnabled?: boolean }).otpEnabled));
        setPinCreated(Boolean((otpBody as { pinCreated?: boolean }).pinCreated));
      }
    } catch (error) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to load profile"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ==========================================
  // Avatar upload (POST /settings/profile/avatar, multipart 'file')
  // ==========================================
  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please choose an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please choose an image under 8MB.", variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/settings/profile/avatar", form);
      const body = assertApiSuccess(res.data, "Failed to upload avatar");
      const uploaded = (body as { data?: { avatarUrl?: string } }).data?.avatarUrl || "";
      const resolved = resolveMediaUrl(uploaded);
      setAvatarUrl(resolved);
      // Persist to auth state so chat + sidebar pick it up
      if (resolved) {
        try { localStorage.setItem("userAvatar", resolved); } catch { /* ignore */ }
      }
      toast({ title: "Profile picture updated" });
    } catch (error) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to upload avatar"), variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ==========================================
  // Editable profile (PUT /settings/profile)
  // ==========================================
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Error", description: "Name cannot be empty", variant: "destructive" });
      return;
    }
    setSavingProfile(true);
    try {
      const res = await api.put("/settings/profile", {
        name: name.trim(),
        phone_number: phone.trim() || null,
      });
      const body = assertApiSuccess(res.data, "Failed to update profile");
      const updated = (body as { data?: OwnProfile }).data;
      const newName = updated?.name || name.trim();
      setProfile((prev) => (prev ? { ...prev, name: newName, phone_number: updated?.phone_number ?? phone } : prev));
      // Keep the auth state in sync (sidebar greets this name)
      try { localStorage.setItem("userName", newName); } catch { /* ignore */ }
      toast({ title: "Profile updated", description: "Your details were saved successfully." });
    } catch (error) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to update profile"), variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  // ==========================================
  // KYC helpers
  // ==========================================
  const kycLevel: KycLevel = (() => {
    if (!kycStatus) return "unverified";
    const user = kycStatus.user_kyc_status;
    const business = kycStatus.business_kyc_status;
    if (user === "verified" && business === "verified") return "verified";
    if (user === "rejected" || business === "rejected") return "rejected";
    if (user === "pending" || (user === "verified" && business !== "verified")) return "pending";
    return "unverified";
  })();

  const kycNextRoute = (() => {
    if (!kycStatus) return "/kyc";
    if (!kycStatus.bvn_verified || !kycStatus.nin_verified) return "/kyc";
    if (kycStatus.business_kyc_status !== "verified") return "/kyc/business";
    return null;
  })();

  const kycSteps = kycStatus
    ? [
        { key: "bvn", label: "BVN verification", done: kycStatus.bvn_verified },
        { key: "nin", label: "NIN verification", done: kycStatus.nin_verified },
        { key: "business", label: "Business verification", done: kycStatus.business_kyc_status === "verified" },
      ]
    : [];

  const displayName = profile?.name || localStorage.getItem("userName") || "User";
  const role = profile?.role || null;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
            Profile
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Your account details, verification status and security shortcuts.
          </p>
        </div>

        {/* Identity card */}
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <div className="h-20 bg-gradient-to-r from-blue-600 via-blue-600 to-violet-600 relative">
            <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_30%,white_1px,transparent_1px)] [background-size:14px_14px]" />
          </div>
          <CardContent className="pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5 -mt-12">
              <div className="relative shrink-0 mx-auto sm:mx-0 sm:ml-2">
                <div className="h-24 w-24 rounded-2xl overflow-hidden border-4 border-background shadow-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={`${displayName} avatar`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-white">{initialsOf(displayName)}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  aria-label="Change profile picture"
                  title="Change profile picture"
                  className="absolute -bottom-1.5 -right-1.5 h-9 w-9 rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-background flex items-center justify-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
                >
                  {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarSelected}
                />
              </div>
              <div className="flex-1 min-w-0 text-center sm:text-left sm:pb-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <h2 className="text-xl font-bold truncate">{displayName}</h2>
                  {role && (
                    <Badge variant="outline" className={cn("capitalize w-fit mx-auto sm:mx-0 border", ROLE_BADGE_STYLES[role] || "")}>
                      {role}
                    </Badge>
                  )}
                </div>
                {profile?.email && (
                  <p className="flex items-center justify-center sm:justify-start gap-1.5 text-sm text-muted-foreground mt-1">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{profile.email}</span>
                  </p>
                )}
              </div>
            </div>

            <Separator className="my-5" />

            {/* Editable details */}
            <form onSubmit={handleSaveProfile} className="grid gap-4 sm:grid-cols-2 max-w-2xl">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Full name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-phone">Phone number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="profile-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+234 800 000 0000"
                    className="pl-9"
                    autoComplete="tel"
                  />
                </div>
              </div>
              {(profile?.jobTitle || profile?.department) && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Role</Label>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Briefcase className="h-4 w-4 shrink-0" />
                    <span>
                      {profile?.jobTitle || ""}
                      {profile?.jobTitle && profile?.department ? " · " : ""}
                      {profile?.department || ""}
                    </span>
                  </div>
                </div>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={savingProfile} className="rounded-xl">
                  {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* KYC status card — mirrors the mobile verification screen */}
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-5 w-5 text-blue-500" />
                  KYC Verification
                </CardTitle>
                <Badge variant="outline" className={cn("border", LEVEL_CONFIG[kycLevel].classes)}>
                  {LEVEL_CONFIG[kycLevel].icon}
                  <span className="ml-1">{LEVEL_CONFIG[kycLevel].label}</span>
                </Badge>
              </div>
              <CardDescription>
                {kycLevel === "verified"
                  ? "Your identity and business are fully verified."
                  : "Verify your identity to unlock wallets, payroll and payouts."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress steps */}
              <ol className="space-y-2.5">
                {kycSteps.length === 0 && (
                  <li className="text-sm text-muted-foreground">Verification status unavailable.</li>
                )}
                {kycSteps.map((step, idx) => (
                  <li key={step.key} className="flex items-center gap-3">
                    {step.done ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-muted-foreground/50" />
                    )}
                    <span className={cn("text-sm", step.done ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {idx + 1}. {step.label}
                    </span>
                    <span className="ml-auto text-[11px] font-medium text-muted-foreground">
                      {step.done ? "Verified" : "Pending"}
                    </span>
                  </li>
                ))}
              </ol>

              {/* Progress bar */}
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    kycLevel === "verified" ? "bg-gradient-to-r from-emerald-500 to-teal-500" : "bg-gradient-to-r from-blue-600 to-violet-600"
                  )}
                  style={{
                    width: `${kycSteps.length ? Math.round((kycSteps.filter((s) => s.done).length / kycSteps.length) * 100) : 0}%`,
                  }}
                />
              </div>

              {kycNextRoute ? (
                <Button asChild className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700">
                  <Link to={kycNextRoute}>
                    Complete verification
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-600 dark:text-emerald-400">
                  <BadgeCheck className="h-4 w-4 shrink-0" />
                  All verifications complete — you have full access.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account security shortcuts */}
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-5 w-5 text-blue-500" />
                Account Security
              </CardTitle>
              <CardDescription>Quick access to your security settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="w-full flex items-center gap-3 rounded-xl border border-border/70 px-3.5 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                <span className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <KeyRound className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Change password</span>
                  <span className="block text-xs text-muted-foreground truncate">Update your sign-in password</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>

              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="w-full flex items-center gap-3 rounded-xl border border-border/70 px-3.5 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                <span className="h-9 w-9 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Transaction OTP</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {otpEnabled === null
                      ? "Status unavailable"
                      : otpEnabled
                        ? "Enabled — transfers require OTP verification"
                        : "Disabled — enable for safer transfers"}
                  </span>
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 border",
                    otpEnabled === null
                      ? "bg-muted text-muted-foreground border-border"
                      : otpEnabled
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  )}
                >
                  {otpEnabled === null ? "Unknown" : otpEnabled ? "On" : "Off"}
                </Badge>
              </button>

              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="w-full flex items-center gap-3 rounded-xl border border-border/70 px-3.5 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                <span className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Lock className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Transaction PIN</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {pinCreated === null ? "Status unavailable" : pinCreated ? "PIN is set and active" : "No PIN set yet"}
                  </span>
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 border",
                    pinCreated === null
                      ? "bg-muted text-muted-foreground border-border"
                      : pinCreated
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  )}
                >
                  {pinCreated === null ? "Unknown" : pinCreated ? "Set" : "Not set"}
                </Badge>
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
