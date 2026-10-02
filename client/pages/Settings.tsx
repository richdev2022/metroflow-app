import React, { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { BusinessProfile, OtpPreferenceResponse, FeeConfig, OtpEnabledResponse } from "@shared/api";
import { assertApiSuccess, getApiMessage, pickResponseField } from "@/lib/api-response";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PinInput from "@/components/PinInput";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Building, Phone, Settings as SettingsIcon, CreditCard, ShieldCheck, Lock, KeyRound } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { IndustryCombobox } from "@/components/industry-combobox";
import TimezoneDropdown from "@/components/TimezoneDropdown";
import { setTimezone, setTimeFormat, formatDateTime, formatTime } from "@/lib/datetime";
import { useCountdown } from "@/hooks/useCountdown";
import { cn } from "@/lib/utils";

export default function Settings() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [otpPreference, setOtpPreference] = useState<string>("email");
  const [otpEnabled, setOtpEnabled] = useState(true);
  const [pinCreated, setPinCreated] = useState(false);
  const [fees, setFees] = useState<FeeConfig[]>([]);
  const { toast } = useToast();
  const { seconds, isActive, startCountdown } = useCountdown();

  // Account Password — the card is ALWAYS visible. Users without a password
  // (Google SSO accounts, or accounts whose stored hash was corrupt) create
  // one; users with a password can always change it.
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [authProvider, setAuthProvider] = useState<string>("local");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Contact Update States
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactType, setContactType] = useState<"email" | "phone">("email");
  const [contactValue, setContactValue] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);

  // PIN Management States
  const [createPinDialogOpen, setCreatePinDialogOpen] = useState(false);
  const [updatePinDialogOpen, setUpdatePinDialogOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [updatePinOtpSent, setUpdatePinOtpSent] = useState(false);

  // OTP-for-transactions toggle: flipping the switch is security-sensitive,
  // so the server requires an OTP confirmation before it takes effect.
  const [otpToggleDialogOpen, setOtpToggleDialogOpen] = useState(false);
  const [otpToggleTarget, setOtpToggleTarget] = useState<boolean | null>(null);
  const [otpToggleOtpSent, setOtpToggleOtpSent] = useState(false);
  const [otpToggleOtp, setOtpToggleOtp] = useState("");
  const [otpToggleLoading, setOtpToggleLoading] = useState(false);
  const otpToggleCountdown = useCountdown();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [profileRes, prefRes, otpEnabledRes, feesRes, meRes] = await Promise.all([
        api.get<{success: boolean, settings?: BusinessProfile, data?: BusinessProfile}>("/settings"),
        api.get<{success: boolean, preference?: string, data?: OtpPreferenceResponse}>("/settings/otp-preference"),
        api.get<OtpEnabledResponse>("/settings/otp-enabled"),
        api.get<{success: boolean, data: FeeConfig[]}>("/fees"),
        api.get<{success: boolean, data?: { hasPassword?: boolean; authProvider?: string }}>("/auth/me").catch(() => null),
      ]);

      const profileData = assertApiSuccess(profileRes.data, "Failed to fetch settings");
      const loadedProfile = profileData.settings ?? profileData.data ?? null;
      setProfile(loadedProfile);
      // Sync the app-wide display timezone with the saved business setting
      setTimezone(loadedProfile?.timezone || "UTC");

      const preference = pickResponseField<string>(
        prefRes.data as Record<string, unknown>,
        "preference",
        "email",
      );
      setOtpPreference(preference);

      const otpData = assertApiSuccess(otpEnabledRes.data, "Failed to get OTP enabled status");
      setOtpEnabled(otpData.otpEnabled);
      setPinCreated(otpData.pinCreated);

      const feesData = assertApiSuccess(feesRes.data, "Failed to fetch fees");
      setFees(feesData.data ?? []);

      // /auth/me is best-effort: its only consumer here is the SSO password card
      const meData = (meRes?.data as { data?: { hasPassword?: boolean; authProvider?: string } } | null)?.data;
      setHasPassword(Boolean(meData?.hasPassword));
      setAuthProvider(meData?.authProvider || "local");

    } catch (error) {
      toast({
        title: "Error",
        description: getApiMessage(error, "Failed to fetch settings"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isGoogleAccount = authProvider.toLowerCase().includes("google");

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    setPasswordLoading(true);
    try {
      const response = await api.post("/auth/set-password", { password: newPassword });
      const data = assertApiSuccess(response.data, "Failed to set password");
      setHasPassword(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Success", description: data.message || "Password created successfully" });
    } catch (error) {
      const message = getApiMessage(error, "Failed to set password");
      // If a password already exists (stale state), just reflect reality
      if (String(message).toLowerCase().includes("already")) setHasPassword(true);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast({ title: "Error", description: "Please enter your current password", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Error", description: "New password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    setPasswordLoading(true);
    try {
      const response = await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      const data = assertApiSuccess(response.data, "Failed to change password");
      setHasPassword(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Success", description: data.message || "Password updated successfully" });
    } catch (error) {
      const message = getApiMessage(error, "Failed to change password");
      // Account actually has no usable password yet (e.g. corrupt legacy
      // hash) — fall back to the create-password flow so the user recovers.
      if (String(message).toLowerCase().includes("no password")) setHasPassword(false);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    try {
      const response = await api.put("/settings", profile);
      const data = assertApiSuccess(response.data, "Failed to update profile");
      toast({ title: "Success", description: data.message || "Profile updated successfully" });
    } catch (error) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to update profile"), variant: "destructive" });
    }
  };

  // Timezone is applied instantly app-wide (lib/datetime) so the preview and
  // every other screen update as soon as the user picks a value; the chosen
  // value is persisted with the profile via the same Save handler (PUT /settings).
  const handleTimezoneChange = (tz: string) => {
    // The combobox emits "" when the current entry is re-picked — keep the value.
    if (!tz) return;
    setTimezone(tz);
    setProfile(prev => (prev ? { ...prev, timezone: tz } : prev));
  };

  // Time format (12h/24h) is applied instantly app-wide like the timezone and
  // persisted through the same endpoint (PUT /settings { time_format }).
  const [timeFormatSaving, setTimeFormatSaving] = useState(false);
  const handleTimeFormatChange = async (fmt: "12h" | "24h") => {
    if (profile?.time_format === fmt || timeFormatSaving) return;
    const previous = profile;
    setTimeFormat(fmt);
    setProfile(prev => (prev ? { ...prev, time_format: fmt } : prev));
    setTimeFormatSaving(true);
    try {
      const response = await api.put("/settings", { ...(previous || {}), time_format: fmt });
      assertApiSuccess(response.data, "Failed to update time format");
      toast({
        title: "Time format updated",
        description: fmt === "12h"
          ? "Times across the app now use the 12-hour clock (3:45 PM)."
          : "Times across the app now use the 24-hour clock (15:45).",
      });
    } catch (error) {
      // Roll back the optimistic change on failure.
      setTimeFormat(previous?.time_format === "12h" ? "12h" : "24h");
      setProfile(previous);
      toast({ title: "Error", description: getApiMessage(error, "Failed to update time format"), variant: "destructive" });
    } finally {
      setTimeFormatSaving(false);
    }
  };

  const handleUpdatePreference = async (val: string) => {
    try {
      const response = await api.put("/settings/otp-preference", { preference: val });
      const data = assertApiSuccess(response.data, "Failed to update preference");
      setOtpPreference(val);
      toast({ title: "Success", description: data.message || "OTP preference updated" });
    } catch (error: any) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to update preference"), variant: "destructive" });
    }
  };

  // Flipping the Transaction OTP switch no longer fires the PUT directly —
  // it first asks the user for an OTP confirmation. The backend enforces
  // this too: PUT /settings/otp-enabled requires { enabled, otp }.
  const handleToggleOtpEnabled = async (enabled: boolean) => {
    if (enabled === otpEnabled) return;
    setOtpToggleTarget(enabled);
    setOtpToggleOtpSent(false);
    setOtpToggleOtp("");
    setOtpToggleDialogOpen(true);
    await sendOtpToggleOtp();
  };

  const sendOtpToggleOtp = async () => {
    try {
      setOtpToggleLoading(true);
      const response = await api.post("/settings/otp-enabled/send-otp");
      assertApiSuccess(response.data, "Failed to send OTP");
      setOtpToggleOtpSent(true);
      otpToggleCountdown.startCountdown();
      toast({ title: "OTP sent", description: "Enter the OTP we sent you to confirm this change." });
    } catch (error: any) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to send OTP"), variant: "destructive" });
      setOtpToggleDialogOpen(false);
      setOtpToggleTarget(null);
    } finally {
      setOtpToggleLoading(false);
    }
  };

  const handleConfirmOtpToggle = async () => {
    if (otpToggleTarget === null) return;
    try {
      setOtpToggleLoading(true);
      const response = await api.put("/settings/otp-enabled", { enabled: otpToggleTarget, otp: otpToggleOtp });
      const data = assertApiSuccess(response.data, "Failed to update OTP setting");
      setOtpEnabled(otpToggleTarget);
      setOtpToggleDialogOpen(false);
      setOtpToggleTarget(null);
      setOtpToggleOtp("");
      toast({ title: "Success", description: data.message || (otpToggleTarget ? "OTP enabled successfully" : "OTP disabled successfully") });
    } catch (error: any) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to update OTP setting"), variant: "destructive" });
    } finally {
      setOtpToggleLoading(false);
    }
  };

  const handleCreatePin = async () => {
    if (newPin.length < 4) {
      toast({ title: "Error", description: "PIN must be at least 4 characters", variant: "destructive" });
      return;
    }
    if (newPin !== confirmNewPin) {
      toast({ title: "Error", description: "PINs do not match", variant: "destructive" });
      return;
    }
    try {
      setPinLoading(true);
      const response = await api.post("/settings/pin", { pin: newPin });
      const data = assertApiSuccess(response.data, "Failed to create PIN");
      setPinCreated(true);
      setCreatePinDialogOpen(false);
      setNewPin("");
      setConfirmNewPin("");
      toast({ title: "Success", description: data.message || "Transaction PIN created successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to create PIN"), variant: "destructive" });
    } finally {
      setPinLoading(false);
    }
  };

  const handleSendPinUpdateOtp = async () => {
    try {
      setPinLoading(true);
      const response = await api.post("/settings/pin/send-otp");
      const data = assertApiSuccess(response.data, "Failed to send OTP");
      setUpdatePinOtpSent(true);
      startCountdown();
      toast({ title: "Success", description: data.message || "OTP sent successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to send OTP"), variant: "destructive" });
    } finally {
      setPinLoading(false);
    }
  };

  const handleUpdatePin = async () => {
    if (newPin.length < 4) {
      toast({ title: "Error", description: "PIN must be at least 4 characters", variant: "destructive" });
      return;
    }
    if (newPin !== confirmNewPin) {
      toast({ title: "Error", description: "PINs do not match", variant: "destructive" });
      return;
    }
    try {
      setPinLoading(true);
      const response = await api.put("/settings/pin", { newPin, otp });
      const data = assertApiSuccess(response.data, "Failed to update PIN");
      setUpdatePinDialogOpen(false);
      setUpdatePinOtpSent(false);
      setNewPin("");
      setConfirmNewPin("");
      setOtp("");
      toast({ title: "Success", description: data.message || "Transaction PIN updated successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to update PIN"), variant: "destructive" });
    } finally {
      setPinLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    try {
      setContactLoading(true);
      const response = await api.post("/settings/update-contact/request-otp", { type: contactType, value: contactValue });
      const data = assertApiSuccess(response.data, "Failed to send OTP");
      setOtpSent(true);
      startCountdown();
      toast({ title: "OTP Sent", description: data.message || `OTP sent to ${contactValue}` });
    } catch (error) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to send OTP"), variant: "destructive" });
    } finally {
      setContactLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    try {
      setContactLoading(true);
      const response = await api.post("/settings/update-contact/verify-otp", { otp });
      const data = assertApiSuccess(response.data, "Invalid OTP");
      toast({ title: "Success", description: data.message || "Contact information updated successfully" });
      setContactDialogOpen(false);
      setOtpSent(false);
      setOtp("");
      setContactValue("");
      fetchData(); // Refresh profile
    } catch (error) {
      toast({ title: "Error", description: getApiMessage(error, "Invalid OTP"), variant: "destructive" });
    } finally {
      setContactLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <Layout>
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:space-y-8 sm:p-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h2>
          <p className="text-muted-foreground">Manage your business profile and preferences.</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-4">
          {/* Horizontally scrollable tab bar — never wraps or overflows the
              viewport on small phones (snap + gradient fade masks at edges). */}
          <div className="relative -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="h-auto min-h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/60 p-1 no-scrollbar sm:justify-center">
              <TabsTrigger value="profile" className="snap-start shrink-0 rounded-lg px-3 py-2">Business Profile</TabsTrigger>
              <TabsTrigger value="contact" className="snap-start shrink-0 rounded-lg px-3 py-2">Contact Info</TabsTrigger>
              <TabsTrigger value="security" className="snap-start shrink-0 rounded-lg px-3 py-2">Security</TabsTrigger>
              <TabsTrigger value="preference" className="snap-start shrink-0 rounded-lg px-3 py-2">OTP Preferences</TabsTrigger>
              <TabsTrigger value="fees" className="snap-start shrink-0 rounded-lg px-3 py-2">Fee Schedule</TabsTrigger>
            </TabsList>
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-3 w-8 bg-gradient-to-r from-background to-transparent sm:hidden" />
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-3 w-8 bg-gradient-to-l from-background to-transparent sm:hidden" />
          </div>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Business Profile</CardTitle>
                <CardDescription>Update your business details.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateProfile} className="max-w-none space-y-4 sm:max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="name">Business Name</Label>
                    <Input 
                      id="name" 
                      value={profile?.name || ""} 
                      onChange={e => setProfile(prev => prev ? {...prev, name: e.target.value} : null)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <IndustryCombobox
                      value={profile?.industry || ""}
                      onChange={value => setProfile(prev => prev ? {...prev, industry: value} : null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <TimezoneDropdown
                      value={profile?.timezone || "UTC"}
                      onChange={handleTimezoneChange}
                      placeholder="Select timezone"
                    />
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                      <p className="font-medium text-foreground">
                        Preview: {formatDateTime(new Date())}
                      </p>
                      <p className="text-muted-foreground">
                        Dates and times across the app will use this timezone.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time-format">Time format</Label>
                    <div
                      role="radiogroup"
                      aria-label="Time format"
                      className="flex w-full max-w-xs items-center rounded-xl border border-border bg-muted/40 p-1 sm:w-fit"
                    >
                      {(["24h", "12h"] as const).map((fmt) => {
                        const active = (profile?.time_format === "12h" ? "12h" : "24h") === fmt;
                        return (
                          <button
                            key={fmt}
                            id={fmt === "12h" ? "time-format-12h" : "time-format-24h"}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={timeFormatSaving}
                            onClick={() => handleTimeFormatChange(fmt)}
                            className={cn(
                              "min-h-10 flex-1 rounded-lg px-4 py-1.5 text-sm font-medium transition-all sm:min-h-0 sm:flex-none sm:min-w-[92px]",
                              active
                                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {fmt === "12h" ? "12-hour" : "24-hour"}
                          </button>
                        );
                      })}
                    </div>
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                      <p className="font-medium text-foreground">
                        Preview: {formatTime(new Date())}
                      </p>
                      <p className="text-muted-foreground">
                        Times across the app (meetings, tasks, chat) will use this clock format.
                      </p>
                    </div>
                  </div>
                   <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Input 
                      id="currency" 
                      value={profile?.currency || ""} 
                      disabled
                    />
                  </div>
                  {/* Sticky save bar — thumb-reachable on mobile, safe-area padded. */}
                  <div className="sticky bottom-0 -mx-1 flex justify-stretch bg-gradient-to-t from-background via-background/95 to-transparent px-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:justify-end">
                    <Button type="submit" className="h-11 w-full px-6 sm:h-10 sm:w-auto">Save Changes</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact">
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>Update email or phone number with OTP verification.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 max-w-2xl">
                    <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Email</div>
                        <div className="font-medium">{profile?.email}</div>
                    </div>
                    <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Phone</div>
                        <div className="font-medium">{profile?.phone_number}</div>
                    </div>
                </div>

                <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { setOtpSent(false); setOtp(""); }}>Update Contact Info</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Update Contact Information</DialogTitle>
                      <DialogDescription>
                        {otpSent ? "Enter the OTP sent to your new contact." : "Enter the new contact details to receive an OTP."}
                      </DialogDescription>
                    </DialogHeader>
                    
                    {!otpSent ? (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <RadioGroup defaultValue="email" onValueChange={(v: "email" | "phone") => setContactType(v)} className="flex gap-4">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="email" id="r-email" />
                                        <Label htmlFor="r-email">Email</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="phone" id="r-phone" />
                                        <Label htmlFor="r-phone">Phone</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                            <div className="space-y-2">
                                <Label>New Value</Label>
                                <Input value={contactValue} onChange={e => setContactValue(e.target.value)} placeholder={contactType === "email" ? "new@example.com" : "+234..."} />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>OTP</Label>
                                <Input value={otp} onChange={e => setOtp(e.target.value)} placeholder="Enter 6-digit OTP" />
                            </div>
                            <div className="text-center">
                                <Button 
                                    variant="link" 
                                    size="sm" 
                                    onClick={handleRequestOtp} 
                                    disabled={contactLoading || isActive}
                                >
                                    {isActive ? `Resend OTP in ${seconds}s` : "Resend OTP"}
                                </Button>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {!otpSent ? (
                            <Button onClick={handleRequestOtp} disabled={contactLoading || !contactValue}>
                                {contactLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Send OTP
                            </Button>
                        ) : (
                            <Button onClick={handleVerifyOtp} disabled={contactLoading || !otp}>
                                {contactLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Verify & Update
                            </Button>
                        )}
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5" />
                  Account Password
                </CardTitle>
                <CardDescription>
                  {hasPassword
                    ? "Update your account password. You can always change it here."
                    : isGoogleAccount
                      ? "You signed up with Google. Create a password to also sign in with your email and password."
                      : "Your account currently has no password. Create one to enable password sign-in."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {hasPassword === null ? (
                  // /auth/me still loading — keep the card mounted to avoid it
                  // "disappearing" for users who have a password set.
                  <div className="flex items-center gap-2 text-sm text-muted-foreground max-w-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking your account security settings…
                  </div>
                ) : hasPassword ? (
                  <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
                    <div className="space-y-2">
                      <Label htmlFor="current-password">Current password</Label>
                      <Input
                        id="current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter your current password"
                        autoComplete="current-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm password</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
                      />
                    </div>
                    <Button type="submit" disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}>
                      {passwordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Update password
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleSetPassword} className="space-y-4 max-w-sm">
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm password</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
                      />
                    </div>
                    <Button type="submit" disabled={passwordLoading || !newPassword || !confirmPassword}>
                      {passwordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create password
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>

             <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  Transaction OTP
                </CardTitle>
                <CardDescription>Toggle OTP requirement for transfers.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Require OTP for Transfers</div>
                    <div className="text-sm text-muted-foreground">When enabled, all transfers will require an OTP verification.</div>
                  </div>
                  <Switch checked={otpEnabled} onCheckedChange={handleToggleOtpEnabled} />
                </div>
              </CardContent>
            </Card>

            {/* Confirm OTP-toggle dialog: flipping the Transaction OTP switch
                requires an OTP confirmation (backend-enforced). */}
            <Dialog open={otpToggleDialogOpen} onOpenChange={(open) => {
              if (!otpToggleLoading) {
                setOtpToggleDialogOpen(open);
                if (!open) setOtpToggleTarget(null);
              }
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm with OTP</DialogTitle>
                  <DialogDescription>
                    {otpToggleTarget
                      ? "You are enabling OTP verification for all transfers. Enter the OTP we sent you to confirm this change."
                      : "You are disabling OTP verification for transfers. Enter the OTP we sent you to confirm this change."}
                  </DialogDescription>
                </DialogHeader>
                {!otpToggleOtpSent ? (
                  <div className="flex items-center gap-2 py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Sending OTP...</span>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>OTP</Label>
                      <Input value={otpToggleOtp} onChange={e => setOtpToggleOtp(e.target.value)} placeholder="Enter 6-digit OTP" inputMode="numeric" maxLength={6} />
                    </div>
                    <div className="text-center">
                      <Button variant="link" size="sm" onClick={sendOtpToggleOtp} disabled={otpToggleLoading || otpToggleCountdown.isActive}>
                        {otpToggleCountdown.isActive ? `Resend OTP in ${otpToggleCountdown.seconds}s` : "Resend OTP"}
                      </Button>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setOtpToggleDialogOpen(false); setOtpToggleTarget(null); }} disabled={otpToggleLoading}>
                    Cancel
                  </Button>
                  {otpToggleOtpSent && (
                    <Button onClick={handleConfirmOtpToggle} disabled={otpToggleLoading || otpToggleOtp.length !== 6}>
                      {otpToggleLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirm
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Transaction PIN
                </CardTitle>
                <CardDescription>Manage your transaction PIN for enhanced security.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">PIN Status</div>
                      <div className="text-sm text-muted-foreground">
                        {pinCreated ? "PIN is set and active" : "No PIN set yet"}
                      </div>
                    </div>
                    {pinCreated ? (
                      <Button onClick={() => {
                        setUpdatePinOtpSent(false);
                        setNewPin("");
                        setConfirmNewPin("");
                        setOtp("");
                        setUpdatePinDialogOpen(true);
                      }}>
                        Update PIN
                      </Button>
                    ) : (
                      <Button onClick={() => {
                        setNewPin("");
                        setConfirmNewPin("");
                        setCreatePinDialogOpen(true);
                      }}>
                        Create PIN
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Create PIN Dialog */}
            <Dialog open={createPinDialogOpen} onOpenChange={setCreatePinDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Transaction PIN</DialogTitle>
                  <DialogDescription>Enter a PIN to secure your transactions.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>New PIN</Label>
                    <PinInput value={newPin} onChange={setNewPin} />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm PIN</Label>
                    <PinInput value={confirmNewPin} onChange={setConfirmNewPin} aria-label="Confirm transaction PIN" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreatePin} disabled={pinLoading || !newPin || !confirmNewPin}>
                    {pinLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create PIN
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Update PIN Dialog */}
            <Dialog open={updatePinDialogOpen} onOpenChange={setUpdatePinDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Update Transaction PIN</DialogTitle>
                  <DialogDescription>
                    {updatePinOtpSent ? "Enter the OTP and your new PIN." : "First, request an OTP to verify your identity."}
                  </DialogDescription>
                </DialogHeader>
                {!updatePinOtpSent ? (
                  <div className="py-4">
                    <Button onClick={handleSendPinUpdateOtp} disabled={pinLoading}>
                      {pinLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Send OTP
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>OTP</Label>
                      <Input value={otp} onChange={e => setOtp(e.target.value)} placeholder="Enter 6-digit OTP" />
                    </div>
                    <div className="space-y-2">
                      <Label>New PIN</Label>
                      <PinInput value={newPin} onChange={setNewPin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirm New PIN</Label>
                      <PinInput value={confirmNewPin} onChange={setConfirmNewPin} aria-label="Confirm new transaction PIN" />
                    </div>
                    <div className="text-center">
                      <Button variant="link" size="sm" onClick={handleSendPinUpdateOtp} disabled={pinLoading || isActive}>
                        {isActive ? `Resend OTP in ${seconds}s` : "Resend OTP"}
                      </Button>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  {updatePinOtpSent && (
                    <Button onClick={handleUpdatePin} disabled={pinLoading || !otp || !newPin || !confirmNewPin}>
                      {pinLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Update PIN
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="preference">
             <Card>
              <CardHeader>
                <CardTitle>OTP Preferences</CardTitle>
                <CardDescription>Choose how you want to receive transaction OTPs.</CardDescription>
              </CardHeader>
              <CardContent>
                 <RadioGroup value={otpPreference} onValueChange={handleUpdatePreference} className="space-y-4">
                    <div className="flex items-center space-x-2 border p-4 rounded-lg">
                        <RadioGroupItem value="email" id="pref-email" />
                        <Label htmlFor="pref-email" className="flex-1 cursor-pointer">
                            <div>Email (Free)</div>
                            <div className="text-sm text-muted-foreground font-normal">Receive OTPs via email address.</div>
                        </Label>
                    </div>
                    <div className="flex items-center space-x-2 border p-4 rounded-lg">
                        <RadioGroupItem value="sms" id="pref-sms" />
                         <Label htmlFor="pref-sms" className="flex-1 cursor-pointer">
                            <div>SMS (Charged)</div>
                            <div className="text-sm text-muted-foreground font-normal">Receive OTPs via mobile phone. Fees apply per SMS.</div>
                        </Label>
                    </div>
                    <div className="flex items-center space-x-2 border p-4 rounded-lg">
                        <RadioGroupItem value="whatsapp" id="pref-whatsapp" />
                         <Label htmlFor="pref-whatsapp" className="flex-1 cursor-pointer">
                            <div>WhatsApp (Charged)</div>
                            <div className="text-sm text-muted-foreground font-normal">Receive OTPs via WhatsApp. Fees apply.</div>
                        </Label>
                    </div>
                     <div className="flex items-center space-x-2 border p-4 rounded-lg">
                        <RadioGroupItem value="both" id="pref-both" />
                         <Label htmlFor="pref-both" className="flex-1 cursor-pointer">
                            <div>Both (Charged)</div>
                            <div className="text-sm text-muted-foreground font-normal">Receive OTPs via multiple channels. Fees apply.</div>
                        </Label>
                    </div>
                 </RadioGroup>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fees">
            <Card>
              <CardHeader>
                <CardTitle>Fee Schedule</CardTitle>
                <CardDescription>Transparency on transaction fees.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Value</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fees.map((fee) => (
                            <TableRow key={fee.id}>
                                <TableCell className="capitalize">{fee.name}</TableCell>
                                <TableCell className="capitalize">{fee.config_type.replace('_', ' ')}</TableCell>
                                <TableCell>
                                    {fee.config_type === 'flat' && `₦${fee.config.amount}`}
                                    {fee.config_type === 'percentage_cap' && `${fee.config.percentage}% (Cap: ₦${fee.config.cap})`}
                                    {fee.config_type === 'flat_conditional' && (
                                        <div className="space-y-1">
                                            {fee.config.conditions?.map((c, i) => (
                                                <div key={i} className="text-sm">
                                                    If amount {c.operator} ₦{c.threshold.toLocaleString()}: ₦{c.fee}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {fee.config_type === 'range' && (
                                        <div className="space-y-1">
                                            {fee.config.ranges?.map((r, i) => (
                                                <div key={i} className="text-sm">
                                                    ₦{r.min.toLocaleString()} - {r.max >= 999999999 ? "Above" : `₦${r.max.toLocaleString()}`}: ₦{r.fee}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
