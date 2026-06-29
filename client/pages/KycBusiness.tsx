import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { KycStatus } from "@shared/api";
import { normalizeKycStatus } from "@/lib/kyc-utils";

export default function KycBusiness() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [formData, setFormData] = useState({
    country: "",
    state: "",
    city: "",
    street: "",
    house_number: "",
    proof_of_address: null as File | null,
  });

  useEffect(() => {
    const checkKycStatus = async () => {
      try {
        const response = await api.get("/kyc/status");
        const status = normalizeKycStatus(response.data);
        if (status.business_kyc_status === "verified") {
          navigate("/dashboard");
        }
      } catch (error) {
        console.error(error);
      } finally {
        setChecking(false);
      }
    };
    checkKycStatus();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append("country", formData.country);
      formDataToSend.append("state", formData.state);
      formDataToSend.append("city", formData.city);
      formDataToSend.append("street", formData.street);
      formDataToSend.append("house_number", formData.house_number);
      if (formData.proof_of_address) {
        formDataToSend.append("proof_of_address", formData.proof_of_address);
      }

      await api.post("/kyc/business", formDataToSend, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      toast({ title: "Success", description: "Business KYC submitted successfully!" });
      navigate("/dashboard");
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.response?.data?.error || error.response?.data?.message || "Failed to submit business KYC", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({ ...prev, proof_of_address: e.target.files![0] }));
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-blue-100">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-center">Business Verification</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input 
                id="country" 
                value={formData.country} 
                onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input 
                id="state" 
                value={formData.state} 
                onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input 
                id="city" 
                value={formData.city} 
                onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="street">Street</Label>
              <Input 
                id="street" 
                value={formData.street} 
                onChange={(e) => setFormData(prev => ({ ...prev, street: e.target.value }))} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="house_number">House Number</Label>
              <Input 
                id="house_number" 
                value={formData.house_number} 
                onChange={(e) => setFormData(prev => ({ ...prev, house_number: e.target.value }))} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proof_of_address">Proof of Address (Utility Bill or Bank Statement)</Label>
              <Input 
                id="proof_of_address" 
                type="file" 
                accept="image/*,.pdf" 
                onChange={handleFileChange} 
                required 
              />
            </div>
            <div className="flex gap-2 mt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => navigate("/kyc")} 
                className="flex-1"
              >
                Back
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
