import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api-client";
import { KycStatus } from "@shared/api";
import { normalizeKycStatus } from "@/lib/kyc-utils";
import { useCountdown } from "@/hooks/useCountdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Kyc() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { seconds, isActive, startCountdown } = useCountdown();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'initiate' | 'otp'>('initiate');
  const [kycType, setKycType] = useState<'bvn' | 'nin'>('bvn');
  const [kycNumber, setKycNumber] = useState('');
  const [kycOtp, setKycOtp] = useState('');
  const [currentStatus, setCurrentStatus] = useState<KycStatus | null>(null);
  const [kycDetails, setKycDetails] = useState<{ message: string; phone: string; firstName: string; lastName: string } | null>(null);

  useEffect(() => {
    const checkCurrentStatus = async () => {
      try {
        const response = await api.get('/kyc/status');
        const status = normalizeKycStatus(response.data);
        setCurrentStatus(status);
        
        if (status.user_kyc_status === 'verified' && status.business_kyc_status === 'verified') {
          navigate('/dashboard');
        } else if (status.user_kyc_status === 'verified') {
          navigate('/kyc/business');
        }
        
        determineNextStep(status);
      } catch (error: any) {
      console.error(error);
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to get KYC status", variant: "destructive" });
    } finally {
        setLoading(false);
      }
    };
    checkCurrentStatus();
  }, [navigate]);

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
        startCountdown();
        toast({ title: "OTP Sent", description: data.message });
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.response?.data?.error || error.response?.data?.message || "Failed to initiate verification", 
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
        
        // Refresh status
        const statusRes = await api.get('/kyc/status');
        const newStatus = normalizeKycStatus(statusRes.data);
        setCurrentStatus(newStatus);

        if (newStatus.bvn_verified && newStatus.nin_verified) {
           toast({ title: "Personal KYC Completed", description: "Now please complete business verification." });
           navigate('/kyc/business');
        } else {
           determineNextStep(newStatus);
        }
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.response?.data?.error || error.response?.data?.message || "Verification failed", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!currentStatus) return null;

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl text-center">Identity Verification</CardTitle>
          <CardDescription className="text-center">
            {step === 'initiate' 
              ? `Please verify your ${kycType.toUpperCase()} to continue.` 
              : `Enter the OTP sent to verify your ${kycType.toUpperCase()}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'initiate' ? (
            <>
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={kycType} onValueChange={(v: any) => setKycType(v)} disabled>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bvn">Bank Verification Number (BVN)</SelectItem>
                    <SelectItem value="nin">National Identity Number (NIN)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    {!currentStatus.bvn_verified && !currentStatus.nin_verified 
                        ? "Please verify BVN first." 
                        : "BVN verified. Please verify NIN."}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{kycType.toUpperCase()} Number</Label>
                <Input 
                  placeholder={`Enter 11-digit ${kycType.toUpperCase()}`}
                  value={kycNumber} 
                  onChange={(e) => setKycNumber(e.target.value)} 
                />
              </div>
              <Button className="w-full" onClick={handleInitiate} disabled={loading}>
                {loading ? "Processing..." : "Verify Identity"}
              </Button>
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
                <Label>Enter OTP</Label>
                <Input 
                  placeholder="Enter the code sent to you" 
                  value={kycOtp} 
                  onChange={(e) => setKycOtp(e.target.value)} 
                />
              </div>
              <div className="text-center">
                <Button 
                  variant="link" 
                  size="sm" 
                  onClick={handleInitiate} 
                  disabled={loading || isActive}
                >
                  {isActive ? `Resend OTP in ${seconds}s` : "Resend OTP"}
                </Button>
              </div>
              <Button className="w-full" onClick={handleVerifyOtp} disabled={loading}>
                {loading ? "Processing..." : "Confirm OTP"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
