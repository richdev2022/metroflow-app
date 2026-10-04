import React, { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api-client";
import { getApiMessage } from "@/lib/api-response";
import { Loader2, Camera, BadgeCheck, Lock, Mail } from "lucide-react";

/**
 * First-login PERSONAL profile completion (invited team members).
 *
 * Product rules:
 *  - Invited users (role != owner/admin) complete a PERSONAL profile:
 *    photo, name, email (READ-ONLY) and a phone number verified via SMS OTP.
 *  - Only business admins ever edit the BUSINESS profile (Settings), so they
 *    never see this gate (the backend's requiresProfileCompletion flag
 *    decides — see /auth/me and the login responses).
 *  - "Skip for now" persists a server-side dismissal; the profile can be
 *    completed later from Settings → Profile.
 */
export function ProfileCompletion() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);

  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const [busy, setBusy] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        if (!cancelled) setChecked(true);
        return;
      }
      try {
        const res = await api.get("/auth/me");
        const me = (res.data?.data || {}) as Record<string, unknown>;
        if (cancelled) return;
        if (me.requiresProfileCompletion === true) {
          setName(String(me.name || ""));
          setEmail(String(me.email || ""));
          setPhone(String(me.phoneNumber || ""));
          setPhoneVerified(me.phoneVerified === true);
          setAvatarUrl(String(me.avatarUrl || ""));
          setOpen(true);
        }
      } catch {
        // Never block the app because the check failed.
      } finally {
        if (!cancelled) setChecked(true);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const pickAvatar = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/settings/profile/avatar", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url =
        res.data?.data?.avatarUrl || res.data?.data?.avatar_url || "";
      if (url) {
        setAvatarUrl(String(url));
        localStorage.setItem("userAvatar", String(url));
        toast({ title: "Profile picture updated" });
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: getApiMessage(error, "Could not upload the picture."),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const sendOtp = async () => {
    if (!phone.trim()) {
      toast({
        title: "Phone number required",
        description: "Enter your phone number first.",
        variant: "destructive",
      });
      return;
    }
    setSendingOtp(true);
    try {
      await api.post("/settings/profile/phone/send-otp", { phone: phone.trim() });
      setOtpSent(true);
      setResendIn(30);
      setOtp("");
      toast({ title: `Verification code sent to ${phone.trim()}` });
    } catch (error) {
      toast({
        title: "Could not send code",
        description: getApiMessage(error, "SMS delivery failed. Try again."),
        variant: "destructive",
      });
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return;
    setVerifyingOtp(true);
    try {
      await api.post("/settings/profile/phone/verify-otp", {
        phone: phone.trim(),
        otp: otp.trim(),
      });
      setPhoneVerified(true);
      setOtpSent(false);
      toast({ title: "Phone number verified" });
    } catch (error) {
      toast({
        title: "Verification failed",
        description: getApiMessage(error, "Invalid or expired code."),
        variant: "destructive",
      });
    } finally {
      setVerifyingOtp(false);
    }
  };

  const saveProfile = async () => {
    if (!name.trim()) {
      toast({
        title: "Your name is required",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      // Email is deliberately NOT sent — it is read-only (account identity).
      await api.put("/settings/profile", {
        name: name.trim(),
        phone_number: phone.trim() || null,
      });
      localStorage.setItem("userName", name.trim());
      setOpen(false);
      toast({ title: "Profile saved", description: "Welcome aboard!" });
    } catch (error) {
      toast({
        title: "Could not save",
        description: getApiMessage(error, "Failed to save your profile."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const skipForNow = async () => {
    setBusy(true);
    try {
      await api.post("/settings/profile/dismiss");
    } catch {
      // Skipping must never trap the user — server failure is non-blocking.
    }
    setOpen(false);
    setBusy(false);
  };

  if (checked === false) return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Block outside-dismiss — force an explicit Save or Skip decision.
        if (!next && !busy) return;
        setOpen(next);
      }}
    >
      <AlertDialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Complete your profile</AlertDialogTitle>
          <AlertDialogDescription>
            Set up your personal profile so teammates can recognise you. You can
            skip and finish it later from Settings → Profile.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {/* Avatar */}
          <div className="relative">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative block h-20 w-20 rounded-full overflow-hidden bg-primary/10 border border-primary/20"
              disabled={uploading}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-primary">
                  {(name || email || "U").trim().charAt(0).toUpperCase()}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 rounded-full bg-primary text-white p-1.5 shadow"
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickAvatar(e.target.files?.[0] || null)}
            />
          </div>
          <p className="text-xs text-muted-foreground">Add a profile photo</p>

          {/* Name */}
          <div className="w-full space-y-1.5">
            <Label htmlFor="pc-name">Full name</Label>
            <Input
              id="pc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          {/* Email — READ-ONLY by design */}
          <div className="w-full space-y-1.5">
            <Label htmlFor="pc-email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email
              <Lock className="h-3 w-3 text-muted-foreground" />
            </Label>
            <Input id="pc-email" value={email} disabled />
            <p className="text-[11px] text-muted-foreground">
              Email can't be changed — it identifies your account.
            </p>
          </div>

          {/* Phone + verification */}
          <div className="w-full space-y-1.5">
            <Label htmlFor="pc-phone">Phone number</Label>
            <div className="flex gap-2">
              <Input
                id="pc-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234 800 000 0000"
                inputMode="tel"
                disabled={phoneVerified}
              />
              {phoneVerified ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-3 text-sm font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                  <BadgeCheck className="h-4 w-4" /> Verified
                </span>
              ) : (
                <Button
                  type="button"
                  onClick={sendOtp}
                  disabled={sendingOtp || resendIn > 0}
                  className="shrink-0"
                >
                  {sendingOtp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : resendIn > 0 ? (
                    `Resend (${resendIn}s)`
                  ) : (
                    "Send code"
                  )}
                </Button>
              )}
            </div>
            {otpSent && !phoneVerified && (
              <div className="flex gap-2 pt-1">
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  className="tracking-[0.4em]"
                />
                <Button
                  type="button"
                  onClick={verifyOtp}
                  disabled={verifyingOtp || otp.length < 4}
                  className="shrink-0"
                  variant="secondary"
                >
                  {verifyingOtp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verify"
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            onClick={saveProfile}
            disabled={busy}
            className="w-full"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Continue"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={skipForNow}
            disabled={busy}
            className="w-full text-muted-foreground"
          >
            Skip for now — I'll do it later in Settings
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
