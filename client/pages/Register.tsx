import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, XCircle, Upload, Check, ChevronsUpDown } from "lucide-react";
import { AuthResponse } from "@shared/api";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  disabled,
  loading
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  loading?: boolean;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {value
            ? options.find((option) => option.value === value)?.label
            : (loading ? "Loading..." : placeholder)}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

type Step = "address" | "business" | "otp";

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("address");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [kycId, setKycId] = useState<string>("");

  // Address Data State
  const [addressData, setAddressData] = useState({
    country: "",
    state: "",
    city: "",
    street: "",
    house_number: "",
    proof_of_address: null as File | null,
  });

  // Location Data State
  const [countries, setCountries] = useState<{ name: string; iso2: string }[]>([]);
  const [states, setStates] = useState<{ name: string }[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loadingLocation, setLoadingLocation] = useState(false);

  // Business Data State
  const [businessData, setBusinessData] = useState({
    businessName: "",
    businessEmail: "",
    businessIndustry: "",
    adminName: "",
    adminEmail: "",
    password: "",
    confirmPassword: "",
    gtbAccount: "",
  });

  // OTP Data State
  const [otpData, setOtpData] = useState({
    email: "",
    otpCode: "",
  });

  // Fetch Countries on Mount
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        setLoadingLocation(true);
        const response = await axios.get("https://countriesnow.space/api/v0.1/countries/positions");
        if (!response.data.error) {
          // Sort countries alphabetically
          const sorted = response.data.data.sort((a: any, b: any) => 
            a.name.localeCompare(b.name)
          );
          setCountries(sorted);
        }
      } catch (err) {
        console.error("Failed to fetch countries", err);
      } finally {
        setLoadingLocation(false);
      }
    };
    fetchCountries();
  }, []);

  // Fetch States when Country Changes
  useEffect(() => {
    if (!addressData.country) {
      setStates([]);
      setCities([]);
      return;
    }

    const fetchStates = async () => {
      try {
        setLoadingLocation(true);
        const response = await axios.post("https://countriesnow.space/api/v0.1/countries/states", {
          country: addressData.country,
        });
        if (!response.data.error) {
          setStates(response.data.data.states);
          setCities([]); // Reset cities
          setAddressData(prev => ({ ...prev, state: "", city: "" }));
        }
      } catch (err) {
        console.error("Failed to fetch states", err);
        setStates([]);
      } finally {
        setLoadingLocation(false);
      }
    };
    fetchStates();
  }, [addressData.country]);

  // Fetch Cities when State Changes
  useEffect(() => {
    if (!addressData.country || !addressData.state) {
      setCities([]);
      return;
    }

    const fetchCities = async () => {
      try {
        setLoadingLocation(true);
        const response = await axios.post("https://countriesnow.space/api/v0.1/countries/state/cities", {
          country: addressData.country,
          state: addressData.state,
        });
        if (!response.data.error) {
          setCities(response.data.data);
          setAddressData(prev => ({ ...prev, city: "" }));
        }
      } catch (err) {
        console.error("Failed to fetch cities", err);
        setCities([]);
      } finally {
        setLoadingLocation(false);
      }
    };
    fetchCities();
  }, [addressData.state]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAddressData({ ...addressData, proof_of_address: e.target.files[0] });
    }
  };

  const handleAddressSubmit = async () => {
    setError(null);
    if (
      !addressData.country ||
      !addressData.state ||
      !addressData.city ||
      !addressData.street ||
      !addressData.house_number ||
      !addressData.proof_of_address
    ) {
      setError("All address fields and Proof of Address are required");
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("country", addressData.country);
      formData.append("state", addressData.state);
      formData.append("city", addressData.city);
      formData.append("street", addressData.street);
      formData.append("house_number", addressData.house_number);
      formData.append("proof_of_address", addressData.proof_of_address);

      const response = await api.post("/kyc/business", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.data.success) {
        setKycId(response.data.kycId);
        setStep("business");
      } else {
        setError(response.data.message || "Failed to submit address");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to submit address");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterBusiness = async () => {
    setError(null);

    if (
      !businessData.businessName ||
      !businessData.businessEmail ||
      !businessData.adminName ||
      !businessData.adminEmail ||
      !businessData.password ||
      !businessData.gtbAccount
    ) {
      setError("All fields are required");
      return;
    }

    if (businessData.password !== businessData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,}$/;
    if (!passwordRegex.test(businessData.password)) {
      setError("Password must be at least 8 characters and contain alphanumeric and symbol characters");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/register", {
        businessName: businessData.businessName,
        businessEmail: businessData.businessEmail,
        businessIndustry: businessData.businessIndustry || undefined,
        adminName: businessData.adminName,
        adminEmail: businessData.adminEmail,
        password: businessData.password,
        kycReferenceId: kycId,
        gtbAccount: businessData.gtbAccount,
      });

      const data = response.data as AuthResponse;

      if (data.success) {
        setOtpData({ email: businessData.adminEmail, otpCode: "" });
        setSuccessMessage(data.message);
        setStep("otp");
      } else {
        setError(data.message || "Registration failed");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to register business");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setError(null);

    if (!otpData.otpCode) {
      setError("OTP code is required");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/verify-otp", {
        email: otpData.email,
        otpCode: otpData.otpCode,
      });

      const data = response.data as AuthResponse;

      if (data.success && data.token) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("userId", data.userId || "");
        localStorage.setItem("businessId", data.businessId || "");
        localStorage.setItem("userName", businessData.adminName);
        setSuccessMessage("Email verified! Redirecting...");
        setTimeout(() => navigate("/dashboard"), 1500);
      } else {
        setError(data.message || "Failed to verify OTP");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to verify OTP");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError(null);

    try {
      setLoading(true);
      const response = await api.post("/auth/resend-otp", { email: otpData.email });

      const data = response.data as AuthResponse;

      if (data.success) {
        setSuccessMessage("OTP sent successfully");
      } else {
        setError(data.message || "Failed to resend OTP");
      }
    } catch (err) {
      setError("Failed to resend OTP");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div 
            className="flex items-center justify-center gap-3 mb-4 cursor-pointer"
            onClick={() => window.location.href = import.meta.env.VITE_SITE_URL}
          >
            <img src="/Assets/logo.png" alt="MetricFlow Logo" className="h-10 w-auto" />
            <span className="font-bold text-xl">MetricFlow</span>
          </div>
          <CardTitle className="text-center">
            {step === "address" && "Step 1: Proof of Address"}
            {step === "business" && "Step 2: Business Details"}
            {step === "otp" && "Verify Email"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {step === "address" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="country">Country *</Label>
                <SearchableSelect
                  value={addressData.country}
                  onChange={(value) => setAddressData({ ...addressData, country: value })}
                  options={countries.map((c) => ({ label: c.name, value: c.name }))}
                  placeholder="Select Country"
                  searchPlaceholder="Search country..."
                  loading={loadingLocation}
                />
              </div>

              <div>
                <Label htmlFor="state">State *</Label>
                <SearchableSelect
                  value={addressData.state}
                  onChange={(value) => setAddressData({ ...addressData, state: value })}
                  options={states.map((s) => ({ label: s.name, value: s.name }))}
                  placeholder="Select State"
                  searchPlaceholder="Search state..."
                  disabled={!addressData.country || loadingLocation}
                  loading={loadingLocation}
                />
              </div>

              <div>
                <Label htmlFor="city">City *</Label>
                <SearchableSelect
                  value={addressData.city}
                  onChange={(value) => setAddressData({ ...addressData, city: value })}
                  options={cities.map((c) => ({ label: c, value: c }))}
                  placeholder="Select City"
                  searchPlaceholder="Search city..."
                  disabled={!addressData.state || loadingLocation}
                  loading={loadingLocation}
                />
              </div>

              <div>
                <Label htmlFor="street">Street *</Label>
                <Input
                  id="street"
                  placeholder="Street Name"
                  value={addressData.street}
                  onChange={(e) => setAddressData({ ...addressData, street: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="house_number">House Number *</Label>
                <Input
                  id="house_number"
                  placeholder="House Number"
                  value={addressData.house_number}
                  onChange={(e) => setAddressData({ ...addressData, house_number: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="proof_of_address">
                  Proof of Address (Utility Bill/Bank Statement) *
                </Label>
                <p className="text-xs font-normal text-muted-foreground mt-1">
                  Must be a recent one not later than 3 months.
                </p>
                <div className="mt-1 flex items-center gap-2">
                   <Input
                    id="proof_of_address"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Supported formats: PDF, JPG, PNG
                </p>
              </div>

              <Button
                onClick={handleAddressSubmit}
                loading={loading}
                className="w-full"
              >
                Next Step
              </Button>
              
               <p className="text-sm text-center text-muted-foreground">
                Already have an account?{" "}
                <button
                  onClick={() => navigate("/login")}
                  className="text-primary hover:underline font-semibold"
                >
                  Login here
                </button>
              </p>
            </div>
          )}

          {step === "business" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="gtbAccount">GTB Account Number *</Label>
                <Input
                  id="gtbAccount"
                  placeholder="0123456789"
                  maxLength={10}
                  value={businessData.gtbAccount}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      gtbAccount: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="businessName">Business Name *</Label>
                <Input
                  id="businessName"
                  placeholder="Your Business Name"
                  value={businessData.businessName}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      businessName: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="businessEmail">Business Email *</Label>
                <Input
                  id="businessEmail"
                  type="email"
                  placeholder="business@example.com"
                  value={businessData.businessEmail}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      businessEmail: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="businessIndustry">Industry</Label>
                <Input
                  id="businessIndustry"
                  placeholder="e.g., Technology, Finance, etc."
                  value={businessData.businessIndustry}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      businessIndustry: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <hr className="my-4" />

              <div>
                <Label htmlFor="adminName">Admin Name *</Label>
                <Input
                  id="adminName"
                  placeholder="Your Full Name"
                  value={businessData.adminName}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      adminName: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="adminEmail">Admin Email *</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="admin@example.com"
                  value={businessData.adminEmail}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      adminEmail: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="password">Password *</Label>
                <PasswordInput
                  id="password"
                  placeholder="••••••••"
                  value={businessData.password}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      password: e.target.value,
                    })
                  }
                  className="mt-1"
                />
                <div className="mt-2 text-xs space-y-1">
                  <div className={`flex items-center gap-1 ${businessData.password.length >= 8 ? "text-green-600" : "text-muted-foreground"}`}>
                    {businessData.password.length >= 8 ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span>Minimum 8 characters</span>
                  </div>
                  <div className={`flex items-center gap-1 ${/^(?=.*[a-zA-Z])(?=.*[0-9])/.test(businessData.password) ? "text-green-600" : "text-muted-foreground"}`}>
                    {/^(?=.*[a-zA-Z])(?=.*[0-9])/.test(businessData.password) ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span>Alphanumeric (letters & numbers)</span>
                  </div>
                   <div className={`flex items-center gap-1 ${/[^a-zA-Z0-9]/.test(businessData.password) ? "text-green-600" : "text-muted-foreground"}`}>
                    {/[^a-zA-Z0-9]/.test(businessData.password) ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span>Contains a symbol</span>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="••••••••"
                  value={businessData.confirmPassword}
                  onChange={(e) =>
                    setBusinessData({
                      ...businessData,
                      confirmPassword: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div className="flex gap-4">
                 <Button
                  variant="outline"
                  onClick={() => setStep("address")}
                  className="w-1/3"
                >
                  Back
                </Button>
                <Button
                  onClick={handleRegisterBusiness}
                  loading={loading}
                  className="w-2/3"
                >
                  Create Account
                </Button>
              </div>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We've sent a 6-digit OTP to <strong>{otpData.email}</strong>
              </p>

              <div>
                <Label htmlFor="otpCode">OTP Code *</Label>
                <Input
                  id="otpCode"
                  placeholder="000000"
                  maxLength={6}
                  value={otpData.otpCode}
                  onChange={(e) =>
                    setOtpData({
                      ...otpData,
                      otpCode: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  className="mt-1 text-center text-2xl tracking-widest"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                OTP expires in 10 minutes
              </p>

              <Button
                onClick={handleVerifyOTP}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Verifying..." : "Verify Email"}
              </Button>

              <Button
                variant="ghost"
                onClick={handleResendOTP}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Sending..." : "Resend OTP"}
              </Button>

              <Button
                variant="outline"
                onClick={() => setStep("business")}
                className="w-full"
              >
                Back
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}