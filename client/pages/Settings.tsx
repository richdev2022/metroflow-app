import React, { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { BusinessProfile, OtpPreferenceResponse, FeeConfig, OtpEnabledResponse } from "@shared/api";
import { assertApiSuccess, getApiMessage, pickResponseField } from "@/lib/api-response";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Building, Phone, Settings as SettingsIcon, CreditCard, ShieldCheck, Lock } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { IndustryCombobox } from "@/components/industry-combobox";
import { useCountdown } from "@/hooks/useCountdown";

export default function Settings() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [otpPreference, setOtpPreference] = useState<string>("email");
  const [otpEnabled, setOtpEnabled] = useState(true);
  const [pinCreated, setPinCreated] = useState(false);
  const [fees, setFees] = useState<FeeConfig[]>([]);
  const { toast } = useToast();
  const { seconds, isActive, startCountdown } = useCountdown();

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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [profileRes, prefRes, otpEnabledRes, feesRes] = await Promise.all([
        api.get<{success: boolean, settings?: BusinessProfile, data?: BusinessProfile}>("/settings"),
        api.get<{success: boolean, preference?: string, data?: OtpPreferenceResponse}>("/settings/otp-preference"),
        api.get<OtpEnabledResponse>("/settings/otp-enabled"),
        api.get<{success: boolean, data: FeeConfig[]}>("/fees")
      ]);

      const profileData = assertApiSuccess(profileRes.data, "Failed to fetch settings");
      setProfile(profileData.settings ?? profileData.data ?? null);

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

  const handleToggleOtpEnabled = async (enabled: boolean) => {
    try {
      const response = await api.put("/settings/otp-enabled", { enabled });
      const data = assertApiSuccess(response.data, "Failed to update OTP setting");
      setOtpEnabled(enabled);
      toast({ title: "Success", description: data.message || (enabled ? "OTP enabled successfully" : "OTP disabled successfully") });
    } catch (error: any) {
      toast({ title: "Error", description: getApiMessage(error, "Failed to update OTP setting"), variant: "destructive" });
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
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">Manage your business profile and preferences.</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList>
            <TabsTrigger value="profile">Business Profile</TabsTrigger>
            <TabsTrigger value="contact">Contact Info</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="preference">OTP Preferences</TabsTrigger>
            <TabsTrigger value="fees">Fee Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Business Profile</CardTitle>
                <CardDescription>Update your business details.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
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
                    <Label htmlFor="currency">Currency</Label>
                    <Input 
                      id="currency" 
                      value={profile?.currency || ""} 
                      disabled
                    />
                  </div>
                  <Button type="submit">Save Changes</Button>
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
                    <Input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="Enter your PIN" maxLength={10} />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm PIN</Label>
                    <Input type="password" value={confirmNewPin} onChange={e => setConfirmNewPin(e.target.value)} placeholder="Confirm your PIN" maxLength={10} />
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
                      <Input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="Enter your new PIN" maxLength={10} />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirm New PIN</Label>
                      <Input type="password" value={confirmNewPin} onChange={e => setConfirmNewPin(e.target.value)} placeholder="Confirm your new PIN" maxLength={10} />
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
