import React, { useState, useEffect } from "react";
import { 
  AlertDialog, 
  AlertDialogContent, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogDescription, 
  AlertDialogFooter 
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api-client";
import { KycStatus } from "@shared/api";
import { normalizeKycStatus } from "@/lib/kyc-utils";

interface KycModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: KycStatus;
  onSuccess: () => void;
}

export function KycModal({ open, onOpenChange, status: initialStatus, onSuccess }: KycModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'initiate' | 'otp'>('initiate');
  const [kycType, setKycType] = useState<'bvn' | 'nin'>('bvn');
  const [kycNumber, setKycNumber] = useState('');
  const [kycOtp, setKycOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<KycStatus>(initialStatus);
  const [kycDetails, setKycDetails] = useState<{ message: string; phone: string; firstName: string; lastName: string } | null>(null);

  useEffect(() => {
    setCurrentStatus(initialStatus);
    determineNextStep(initialStatus);
  }, [initialStatus, open]);

  const determineNextStep = (status: KycStatus) => {
    setStep('initiate');
    setKycNumber('');
    setKycOtp('');
    setKycDetails(null);
    
    if (!status.bvn_verified) {
      setKycType('bvn');
    } else if (!status.nin_verified) {
      setKycType('nin');
    }
  };

  const handleInitiate = async () => {
    setLoading(true);
    try {
      const response = await api.post('/kyc/initiate', { type: kycType, number: kycNumber });
      const data = response.data;
      
      if (data.success) {
        setKycDetails({
          message: data.message,
          phone: data.phone,
          firstName: data.firstName,
          lastName: data.lastName
        });
        setStep('otp');
        toast({ title: "OTP Sent", description: data.message });
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.response?.data?.error || "Failed to initiate verification", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    try {
      const response = await api.post('/kyc/verify-otp', { otp: kycOtp });
      if (response.data.success) {
        toast({ title: "Verified", description: `${kycType.toUpperCase()} verified successfully` });
        
        // Refresh status to check what's next
        const statusRes = await api.get('/kyc/status');
        const newStatus = normalizeKycStatus(statusRes.data);
        setCurrentStatus(newStatus);

        if (newStatus.user_kyc_status === 'verified') {
           toast({ title: "KYC Completed", description: "You are now fully verified." });
           onSuccess();
           onOpenChange(false);
        } else {
           // Still missing something
           determineNextStep(newStatus);
        }
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.response?.data?.error || "Verification failed", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const isBvnNext = !currentStatus.bvn_verified;
  const isNinNext = currentStatus.bvn_verified && !currentStatus.nin_verified;
  
  // If we are initiating, we force the type based on what is missing
  // The user cannot choose freely if we want to enforce flow, 
  // but requirements say "After user verify BVN, prompt them to Verify NIN also"
  // So we auto-select the missing one.

  return (
    <AlertDialog open={open} onOpenChange={(val) => {
        // Prevent closing if not verified, unless we want to allow user to cancel and not access the page
        if (!val) onOpenChange(false);
    }}>
      <AlertDialogContent className="flex flex-col w-[90vw] max-w-[425px] max-h-[80vh] overflow-y-auto p-4 sm:p-6 rounded-lg gap-4 bg-background">
        <AlertDialogHeader className="shrink-0">
          <AlertDialogTitle className="text-lg sm:text-xl text-left">Identity Verification Required</AlertDialogTitle>
          <AlertDialogDescription className="text-sm sm:text-base text-left">
            {step === 'initiate' 
              ? `Please verify your ${kycType.toUpperCase()} to continue.` 
              : `Enter the OTP sent to verify your ${kycType.toUpperCase()}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2 space-y-3 sm:space-y-4">
          {step === 'initiate' ? (
            <>
              <div className="space-y-2">
                <Label className="text-sm sm:text-base">Document Type</Label>
                <Select 
                    value={kycType} 
                    onValueChange={(v: any) => setKycType(v)}
                    disabled={true} // Lock it to the current required step
                >
                  <SelectTrigger className="h-9 sm:h-10 text-sm sm:text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bvn">Bank Verification Number (BVN)</SelectItem>
                    <SelectItem value="nin">National Identity Number (NIN)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs sm:text-sm text-muted-foreground">
                    {!currentStatus.bvn_verified && !currentStatus.nin_verified 
                        ? "Please verify BVN first." 
                        : "BVN verified. Please verify NIN."}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm sm:text-base">{kycType.toUpperCase()} Number</Label>
                <Input 
                  className="h-9 sm:h-10 text-sm sm:text-base"
                  placeholder={`Enter 11-digit ${kycType.toUpperCase()}`}
                  value={kycNumber} 
                  onChange={(e) => setKycNumber(e.target.value)} 
                />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {kycDetails && (
                <div className="bg-muted p-3 rounded-md space-y-2 text-sm">
                  <p className="font-medium text-primary">{kycDetails.message}</p>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <div>
                      <span className="block text-xs uppercase">Name</span>
                      <span className="font-medium text-foreground">{kycDetails.firstName} {kycDetails.lastName}</span>
                    </div>
                    <div>
                      <span className="block text-xs uppercase">Phone Linked</span>
                      <span className="font-medium text-foreground">{kycDetails.phone}</span>
                    </div>
                  </div>
                </div>
              )}
               <div className="space-y-2">
                 <Label className="text-sm sm:text-base">Enter OTP</Label>
                 <Input 
                    className="h-9 sm:h-10 text-sm sm:text-base"
                    placeholder="Enter the code sent to you" 
                    value={kycOtp} 
                    onChange={(e) => setKycOtp(e.target.value)} 
                  />
               </div>
            </div>
          )}
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" className="w-full sm:w-auto mt-2 sm:mt-0" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="w-full sm:w-auto" onClick={step === 'initiate' ? handleInitiate : handleVerifyOtp} disabled={loading}>
            {loading ? "Processing..." : step === 'initiate' ? "Verify Identity" : "Confirm OTP"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
