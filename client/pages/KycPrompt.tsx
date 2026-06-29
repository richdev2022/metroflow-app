import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { KycStatus } from "@shared/api";
import { normalizeKycStatus } from "@/lib/kyc-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function KycPrompt() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);

  useEffect(() => {
    const checkKyc = async () => {
      try {
        const response = await api.get("/kyc/status");
        const status = normalizeKycStatus(response.data);
        setKycStatus(status);
        
        if (status.user_kyc_status === "verified") {
          navigate("/dashboard");
        }
      } catch (error) {
        console.error("Failed to get KYC status", error);
      } finally {
        setLoading(false);
      }
    };
    checkKyc();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const getNextStep = () => {
    if (!kycStatus) return null;
    if (!kycStatus.bvn_verified) return "bvn";
    if (!kycStatus.nin_verified) return "nin";
    if (kycStatus.business_kyc_status !== "verified") return "business";
    return null;
  };

  const nextStep = getNextStep();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-blue-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Complete Your Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span>BVN Verification</span>
              <Badge variant={kycStatus?.bvn_verified ? "default" : "secondary"}>
                {kycStatus?.bvn_verified ? "Verified" : "Pending"}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span>NIN Verification</span>
              <Badge variant={kycStatus?.nin_verified ? "default" : "secondary"}>
                {kycStatus?.nin_verified ? "Verified" : "Pending"}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span>Business Verification</span>
              <Badge variant={kycStatus?.business_kyc_status === "verified" ? "default" : "secondary"}>
                {kycStatus?.business_kyc_status === "verified" ? "Verified" : "Pending"}
              </Badge>
            </div>
          </div>

          {nextStep && (
            <Button 
              className="w-full mt-4"
              onClick={() => navigate("/kyc")}
            >
              {nextStep === "bvn" && "Verify BVN"}
              {nextStep === "nin" && "Verify NIN"}
              {nextStep === "business" && "Complete Business Verification"}
            </Button>
          )}

          {!nextStep && (
            <Button 
              className="w-full mt-4"
              onClick={() => navigate("/dashboard")}
            >
              Continue to Dashboard
            </Button>
          )}

          {kycStatus?.user_kyc_status === "verified" && (
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigate("/dashboard")}
            >
              Skip to Dashboard
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
