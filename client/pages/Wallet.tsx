import React, { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { WalletInfo, FundWalletInput, CreateBusinessWalletInput } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Wallet as WalletIcon, Building2, CreditCard, ArrowRight, CheckCircle2, AlertCircle, Plus, RefreshCw, Upload, CheckCircle, ArrowRightLeft } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import axios from "axios";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fundWalletSchema = z.object({
  amount: z.string().min(1, "Amount is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Amount must be greater than 0"),
});

const transferSchema = z.object({
  wallet_id: z.string().min(1, "Source wallet is required"),
  bankCode: z.string().min(1, "Bank is required"),
  accountNumber: z.string().length(10, "Account number must be 10 digits"),
  accountName: z.string().min(3, "Account name is required"),
  amount: z.string().min(1, "Amount is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Amount must be greater than 0"),
  remark: z.string().optional(),
});

const createBusinessWalletSchema = z.object({
  business_name: z.string().min(3, "Business name is required"),
  gtb_account_number: z.string().length(10, "Account number must be 10 digits"),
});

export default function Wallet() {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fundingLoading, setFundingLoading] = useState(false);
  const [creatingVaLoading, setCreatingVaLoading] = useState(false);
  const { toast } = useToast();
  const [fundWalletOpen, setFundWalletOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedWalletType, setSelectedWalletType] = useState<"user" | "business">("user");

  // Transfer State
  const [transferStep, setTransferStep] = useState<"details" | "otp">("details");
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [lookupName, setLookupName] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [otp, setOtp] = useState("");

  // Business Wallet Creation State
  const [createStep, setCreateStep] = useState<"kyc" | "details">("kyc");
  const [kycId, setKycId] = useState<string>("");
  const [kycLoading, setKycLoading] = useState(false);
  
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

  const fundForm = useForm<z.infer<typeof fundWalletSchema>>({
    resolver: zodResolver(fundWalletSchema),
    defaultValues: { amount: "" },
  });

  const businessWalletForm = useForm<z.infer<typeof createBusinessWalletSchema>>({
    resolver: zodResolver(createBusinessWalletSchema),
    defaultValues: { business_name: "", gtb_account_number: "" },
  });

  const transferForm = useForm<z.infer<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      wallet_id: "",
      bankCode: "",
      accountNumber: "",
      accountName: "",
      amount: "",
      remark: "",
    },
  });

  // Fetch Banks
  useEffect(() => {
    if (transferOpen) {
      const fetchBanks = async () => {
        try {
          const response = await api.get("/transfers/banks");
          setBanks(response.data.data);
        } catch (error) {
          console.error("Failed to fetch banks", error);
        }
      };
      fetchBanks();
    }
  }, [transferOpen]);

  // Account Lookup
  const handleAccountLookup = async (accountNumber: string, bankCode: string) => {
    if (accountNumber.length === 10 && bankCode) {
      try {
        setLookupLoading(true);
        setLookupError(null);
        setLookupName(null);
        // Clear previous manual entry if we are looking up again? 
        // Or keep it? Let's clear to avoid confusion if they changed account number
        transferForm.setValue("accountName", ""); 
        
        const response = await api.post("/transfers/lookup", {
          bankCode,
          accountNumber,
        });
        const name = response.data.data.account_name;
        setLookupName(name);
        transferForm.setValue("accountName", name);
      } catch (error: any) {
        setLookupName(null);
        setLookupError(error.response?.data?.message || "Could not verify account name");
        // Ensure field is empty for manual entry or keep what user typed? 
        // If lookup fails, we should probably not clear what they might have manually typed if they typed first? 
        // But here we are triggering on change of acc number/bank, so they probably haven't typed a name for *this* new combo yet.
        // So clearing is safe and correct to prompt entry.
        transferForm.setValue("accountName", ""); 
      } finally {
        setLookupLoading(false);
      }
    }
  };
  
  // Watch for account number and bank code changes
  const watchedAccountNumber = transferForm.watch("accountNumber");
  const watchedBankCode = transferForm.watch("bankCode");
  
  useEffect(() => {
      if (watchedAccountNumber?.length === 10 && watchedBankCode) {
          handleAccountLookup(watchedAccountNumber, watchedBankCode);
      } else {
          setLookupName(null);
          setLookupError(null);
          // Don't clear accountName here necessarily, maybe they are just fixing a digit. 
          // But if they clear account number, name should probably clear.
          if (!watchedAccountNumber || !watchedBankCode) {
               transferForm.setValue("accountName", "");
          }
      }
  }, [watchedAccountNumber, watchedBankCode]);


  const onInitiateTransfer = async (values: z.infer<typeof transferSchema>) => {
     // Removed lookupName check to allow proceeding even if lookup failed
     
     try {
         setOtpLoading(true);
         // Request OTP flow
         await api.post("/transfers/otp/request", {
             wallet_id: values.wallet_id
         });
         setTransferStep("otp");
         toast({
             title: "OTP Sent",
             description: "Please enter the OTP sent to your email/phone",
         });
     } catch (error: any) {
         toast({
             title: "Error",
             description: error.response?.data?.message || "Failed to request OTP",
             variant: "destructive"
         });
     } finally {
         setOtpLoading(false);
     }
  };
  
  const onFinalizeTransfer = async () => {
      if (!otp || otp.length < 4) {
          toast({
              title: "Error",
              description: "Please enter a valid OTP",
              variant: "destructive"
          });
          return;
      }
      
      try {
          setTransferLoading(true);
          const values = transferForm.getValues();
          
          // Construct payload matching schema exactly
          const payload = {
              bankCode: values.bankCode,
              accountNumber: values.accountNumber,
              accountName: values.accountName,
              amount: Number(values.amount),
              remark: values.remark || "",
              otp: otp,
              wallet_id: values.wallet_id
          };

          await api.post("/transfers/single", payload);
          
          toast({
              title: "Success",
              description: "Transfer successful",
          });
          setTransferOpen(false);
          setTransferStep("details");
          transferForm.reset();
          setOtp("");
          fetchWalletInfo();
      } catch (error: any) {
          toast({
              title: "Error",
              description: error.response?.data?.message || "Transfer failed",
              variant: "destructive"
          });
      } finally {
          setTransferLoading(false);
      }
  };

  const fetchWalletInfo = async () => {
    try {
      const response = await api.get<WalletInfo>("/wallet");
      setWalletInfo(response.data);
    } catch (error) {
      console.error("Failed to fetch wallet info", error);
      toast({
        title: "Error",
        description: "Failed to load wallet information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletInfo();
  }, []);

  // Fetch Countries on Mount
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        setLoadingLocation(true);
        const response = await axios.get("https://countriesnow.space/api/v0.1/countries/positions");
        if (!response.data.error) {
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
          setCities([]);
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
    if (
      !addressData.country ||
      !addressData.state ||
      !addressData.city ||
      !addressData.street ||
      !addressData.house_number ||
      !addressData.proof_of_address
    ) {
      toast({
        title: "Validation Error",
        description: "All address fields and Proof of Address are required",
        variant: "destructive",
      });
      return;
    }

    try {
      setKycLoading(true);
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
        setCreateStep("details");
        toast({
          title: "Success",
          description: "Proof of address submitted. Please provide business details.",
        });
      } else {
        toast({
          title: "Error",
          description: response.data.message || "Failed to submit address",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.message || "Failed to submit address",
        variant: "destructive",
      });
    } finally {
      setKycLoading(false);
    }
  };

  const onFundWallet = async (values: z.infer<typeof fundWalletSchema>) => {
    try {
      setFundingLoading(true);
      const response = await api.post("/wallet/fund/card", {
        amount: Number(values.amount),
        wallet_type: selectedWalletType,
      });
      
      if (response.data.payment_url) {
        window.location.href = response.data.payment_url;
      } else {
         toast({
          title: "Error",
          description: "No payment URL received",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to initiate payment",
        variant: "destructive",
      });
    } finally {
      setFundingLoading(false);
    }
  };

  const onCreateBusinessWallet = async (values: z.infer<typeof createBusinessWalletSchema>) => {
    if (!kycId) {
      toast({
        title: "Error",
        description: "KYC Reference missing. Please submit proof of address first.",
        variant: "destructive",
      });
      return;
    }

    try {
      await api.post("/wallet/business/create", {
        ...values,
        kycReferenceId: kycId
      });
      toast({
        title: "Success",
        description: "Business wallet created successfully",
      });
      fetchWalletInfo();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to create business wallet",
        variant: "destructive",
      });
    }
  };

  const onCreateVirtualAccount = async () => {
    try {
      setCreatingVaLoading(true);
      await api.post("/wallet/create-virtual-account");
      toast({
        title: "Success",
        description: "Virtual Account created successfully",
      });
      fetchWalletInfo();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to create virtual account",
        variant: "destructive",
      });
    } finally {
      setCreatingVaLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-8 space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Wallet</h2>
          <p className="text-muted-foreground">Manage your personal and business finances.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* User Wallet Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Personal Wallet</CardTitle>
              <WalletIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {walletInfo?.user_wallet ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-2xl font-bold">
                      {walletInfo.user_wallet.currency} {walletInfo.user_wallet.balance.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Available Balance</p>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Virtual Account</p>
                       <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6" 
                        onClick={onCreateVirtualAccount}
                        loading={creatingVaLoading}
                        title="Create/Retry Virtual Account"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>
                    {walletInfo.user_wallet.account_number === "Not Created" && !walletInfo.user_wallet.virtual_account_number ? (
                      <Button 
                        variant="outline" 
                        className="w-full mt-2"
                        onClick={onCreateVirtualAccount}
                        disabled={creatingVaLoading}
                      >
                        {creatingVaLoading ? (
                           <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                           <Plus className="mr-2 h-4 w-4" /> 
                        )}
                        Create Virtual Account
                      </Button>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-lg font-mono">{walletInfo.user_wallet.virtual_account_number || walletInfo.user_wallet.account_number}</span>
                          <span className="text-xs text-muted-foreground">{walletInfo.user_wallet.bank_name || "Providus Bank"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Transfer to this account to fund wallet</p>
                      </>
                    )}
                  </div>
                   <Button 
                    className="w-full mt-4" 
                    onClick={() => {
                        setSelectedWalletType("user");
                        setFundWalletOpen(true);
                    }}
                   >
                    <CreditCard className="mr-2 h-4 w-4" /> Fund via Card
                  </Button>
                   <Button 
                    variant="outline"
                    className="w-full mt-2" 
                    onClick={() => {
                        setSelectedWalletType("user");
                        setTransferOpen(true);
                        if (walletInfo?.user_wallet?.id) {
                            transferForm.setValue("wallet_id", walletInfo.user_wallet.id);
                        }
                    }}
                   >
                    <ArrowRightLeft className="mr-2 h-4 w-4" /> Transfer
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                   <p className="text-muted-foreground">No wallet found. Complete KYC.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Business Wallet Card */}
          <Card className="md:col-span-2 lg:col-span-2">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Business Wallet</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {walletInfo?.business_wallet ? (
                <div className="space-y-4">
                   <div>
                    <div className="text-2xl font-bold">
                      {walletInfo.business_wallet.currency} {walletInfo.business_wallet.balance.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">{walletInfo.business_wallet.business_name}</p>
                  </div>
                   <div className="pt-4 border-t">
                    <p className="text-sm font-medium">Virtual Account</p>
                    <div className="flex items-center justify-between mt-1">
                       <span className="text-lg font-mono">{walletInfo.business_wallet.account_number}</span>
                       <span className="text-xs text-muted-foreground">{walletInfo.business_wallet.bank_name}</span>
                    </div>
                     <p className="text-xs text-muted-foreground mt-1">Transfer to this account to fund wallet</p>
                  </div>
                   <div className="flex flex-col gap-2 mt-4">
                       <Button 
                        className="w-fit" 
                        onClick={() => {
                            setSelectedWalletType("business");
                            setFundWalletOpen(true);
                        }}
                       >
                        <CreditCard className="mr-2 h-4 w-4" /> Fund via Card
                      </Button>
                       <Button 
                        variant="outline"
                        className="w-fit" 
                        onClick={() => {
                            setSelectedWalletType("business");
                            setTransferOpen(true);
                             if (walletInfo?.business_wallet?.id) {
                                transferForm.setValue("wallet_id", walletInfo.business_wallet.id);
                            }
                        }}
                       >
                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Transfer
                      </Button>
                   </div>
                </div>
              ) : (
                <div className="space-y-6">
                   <div>
                      <h3 className="text-lg font-semibold">Create Business Wallet</h3>
                      <p className="text-sm text-muted-foreground">Complete the steps below to create a business wallet.</p>
                   </div>

                   {/* Stepper Indicator */}
                   <div className="flex items-center gap-4 text-sm">
                      <div className={`flex items-center gap-2 ${createStep === 'kyc' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                         <div className={`h-6 w-6 rounded-full flex items-center justify-center border ${createStep === 'kyc' ? 'border-primary bg-primary text-primary-foreground' : (createStep === 'details' ? 'border-green-600 bg-green-600 text-white' : 'border-muted')}`}>
                            {createStep === 'details' ? <CheckCircle className="h-4 w-4" /> : '1'}
                         </div>
                         Proof of Address
                      </div>
                      <div className="h-px w-8 bg-border" />
                      <div className={`flex items-center gap-2 ${createStep === 'details' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                         <div className={`h-6 w-6 rounded-full flex items-center justify-center border ${createStep === 'details' ? 'border-primary bg-primary text-primary-foreground' : 'border-muted'}`}>
                            2
                         </div>
                         Business Details
                      </div>
                   </div>

                   {createStep === 'kyc' && (
                     <div className="space-y-4 max-w-xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="country">Country *</Label>
                            <Select
                              value={addressData.country}
                              onValueChange={(value) => setAddressData({ ...addressData, country: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select Country" />
                              </SelectTrigger>
                              <SelectContent>
                                {countries.map((c) => (
                                  <SelectItem key={c.name} value={c.name}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="state">State *</Label>
                            <Select
                              value={addressData.state}
                              onValueChange={(value) => setAddressData({ ...addressData, state: value })}
                              disabled={!addressData.country || loadingLocation}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={loadingLocation ? "Loading..." : "Select State"} />
                              </SelectTrigger>
                              <SelectContent>
                                {states.map((s) => (
                                  <SelectItem key={s.name} value={s.name}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div className="space-y-2">
                            <Label htmlFor="city">City *</Label>
                            <Select
                              value={addressData.city}
                              onValueChange={(value) => setAddressData({ ...addressData, city: value })}
                              disabled={!addressData.state || loadingLocation}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={loadingLocation ? "Loading..." : "Select City"} />
                              </SelectTrigger>
                              <SelectContent>
                                {cities.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {c}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="street">Street *</Label>
                            <Input
                              id="street"
                              placeholder="Street Name"
                              value={addressData.street}
                              onChange={(e) => setAddressData({ ...addressData, street: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="house_number">House Number *</Label>
                            <Input
                              id="house_number"
                              placeholder="House Number"
                              value={addressData.house_number}
                              onChange={(e) => setAddressData({ ...addressData, house_number: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="proof_of_address">Proof of Address (Utility Bill/Bank Statement) *</Label>
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
                          <p className="text-xs text-muted-foreground">
                            Supported formats: PDF, JPG, PNG
                          </p>
                        </div>

                        <Button
                          onClick={handleAddressSubmit}
                          disabled={kycLoading}
                          className="w-full md:w-auto"
                        >
                          {kycLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Next: Business Details
                        </Button>
                     </div>
                   )}

                   {createStep === 'details' && (
                     <Form {...businessWalletForm}>
                        <form onSubmit={businessWalletForm.handleSubmit(onCreateBusinessWallet)} className="space-y-4 max-w-xl">
                          <FormField
                            control={businessWalletForm.control}
                            name="business_name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Business Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="My Corp" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                           <FormField
                            control={businessWalletForm.control}
                            name="gtb_account_number"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>GTBank Account Number</FormLabel>
                                <FormControl>
                                  <Input placeholder="0123456789" {...field} maxLength={10} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex gap-4">
                            <Button 
                              type="button" 
                              variant="outline" 
                              onClick={() => setCreateStep('kyc')}
                            >
                              Back
                            </Button>
                            <Button type="submit">Create Business Wallet</Button>
                          </div>
                        </form>
                     </Form>
                   )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={fundWalletOpen} onOpenChange={setFundWalletOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fund {selectedWalletType === 'user' ? 'Personal' : 'Business'} Wallet</DialogTitle>
              <DialogDescription>
                Enter amount to fund via card.
              </DialogDescription>
            </DialogHeader>
            <Form {...fundForm}>
              <form onSubmit={fundForm.handleSubmit(onFundWallet)} className="space-y-4">
                <FormField
                  control={fundForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (NGN)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="5000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" loading={fundingLoading}>
                    Proceed to Payment
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={transferOpen} onOpenChange={(open) => {
            setTransferOpen(open);
            if (!open) {
                setTransferStep("details");
                transferForm.reset();
                setOtp("");
                setLookupName(null);
            }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Transfer Funds</DialogTitle>
              <DialogDescription>
                Transfer funds from your {selectedWalletType === 'user' ? 'Personal' : 'Business'} Wallet.
              </DialogDescription>
            </DialogHeader>
            
            {transferStep === 'details' ? (
                <Form {...transferForm}>
                  <form onSubmit={transferForm.handleSubmit(onInitiateTransfer)} className="space-y-4">
                    
                    <FormField
                      control={transferForm.control}
                      name="bankCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bank Name</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Bank" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {banks.map((bank: any) => (
                                    <SelectItem key={bank.code} value={bank.code}>
                                        {bank.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={transferForm.control}
                      name="accountNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Number</FormLabel>
                          <FormControl>
                            <Input placeholder="0123456789" {...field} maxLength={10} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {lookupLoading && <p className="text-sm text-muted-foreground">Verifying account...</p>}
                    
                    <FormField
                      control={transferForm.control}
                      name="accountName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Name</FormLabel>
                          <FormControl>
                            <Input 
                                placeholder="Account Name" 
                                {...field} 
                                // Read only if lookup was successful (lookupName is set), otherwise editable
                                readOnly={!!lookupName}
                                className={lookupName ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {lookupError && (
                        <p className="text-sm text-destructive mt-1">
                            {lookupError} - Please enter name manually
                        </p>
                    )}

                    <FormField
                      control={transferForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="5000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={transferForm.control}
                      name="remark"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Remark (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Transfer" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button type="submit" loading={otpLoading} disabled={lookupLoading}>
                        Request OTP
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
            ) : (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Enter OTP</Label>
                        <Input 
                            value={otp} 
                            onChange={(e) => setOtp(e.target.value)} 
                            placeholder="Enter OTP" 
                        />
                        <p className="text-xs text-muted-foreground">
                            Enter the OTP sent to your registered contact.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTransferStep("details")}>Back</Button>
                        <Button onClick={onFinalizeTransfer} loading={transferLoading}>
                            Confirm Transfer
                        </Button>
                    </DialogFooter>
                </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}