import React, { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { WalletInfo, FundWalletInput, CreateVirtualAccountInput, OtpEnabledResponse } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Wallet as WalletIcon, Building2, CreditCard, ArrowRightLeft, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
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
import { useToast } from "@/components/ui/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCountdown } from "@/hooks/useCountdown";

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

export default function Wallet() {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fundingLoading, setFundingLoading] = useState(false);
  const [creatingVaLoading, setCreatingVaLoading] = useState<string | null>(null); // Track which wallet we're creating VA for
  const { toast } = useToast();
  const [fundWalletOpen, setFundWalletOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedWalletType, setSelectedWalletType] = useState<"user" | "business">("user");
  const [bankOpen, setBankOpen] = useState(false);

  // Transfer State
  const [transferStep, setTransferStep] = useState<"details" | "otp">("details");
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [lookupName, setLookupName] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [otpMethod, setOtpMethod] = useState<string>("");
  const [otpEnabled, setOtpEnabled] = useState(true);
  const [pinCreated, setPinCreated] = useState(false);
  const [showCreatePinModal, setShowCreatePinModal] = useState(false);
  const [showResetPinModal, setShowResetPinModal] = useState(false);
  const [resetPinOtp, setResetPinOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [showTransferSuccessModal, setShowTransferSuccessModal] = useState(false);
  const [successfulTransfer, setSuccessfulTransfer] = useState<any>(null);
  const { seconds, isActive, startCountdown } = useCountdown();

  const fundForm = useForm<z.infer<typeof fundWalletSchema>>({
    resolver: zodResolver(fundWalletSchema),
    defaultValues: { amount: "" },
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
        transferForm.setValue("accountName", ""); 
        
        const response = await api.post("/transfers/account-lookup", {
          bank_code: bankCode,
          account_number: accountNumber,
        });
        let name = "";
        if (response.data.data?.responseBody?.accountName) {
          name = response.data.data.responseBody.accountName;
        } else if (response.data.data?.account_name) {
          name = response.data.data.account_name;
        } else if (response.data.data?.accountName) {
          name = response.data.data.accountName;
        }
        setLookupName(name);
        transferForm.setValue("accountName", name);
      } catch (error: any) {
      setLookupName(null);
      setLookupError(error.response?.data?.error || error.response?.data?.message || "Could not verify account name");
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
          if (!watchedAccountNumber || !watchedBankCode) {
               transferForm.setValue("accountName", "");
          }
      }
  }, [watchedAccountNumber, watchedBankCode]);

  const onInitiateTransfer = async (values: z.infer<typeof transferSchema>) => {
     if (!pin || pin.length !== 4) {
          toast({
              title: "Error",
              description: "Please enter your 4-digit transaction PIN",
              variant: "destructive"
          });
          return;
      }

      if (otpEnabled) {
        try {
          setOtpLoading(true);
          const requestData: any = {
              wallet_id: values.wallet_id
          };
          if (otpMethod) {
              requestData.otp_method = otpMethod;
          }
          await api.post("/transfers/otp/request", requestData);
          setTransferStep("otp");
          toast({
              title: "OTP Sent",
              description: "Please enter the OTP sent to you",
          });
        } catch (error: any) {
          toast({
            title: "Error",
            description: error.response?.data?.error || error.response?.data?.message || "Failed to request OTP",
            variant: "destructive"
          });
        } finally {
            setOtpLoading(false);
        }
      } else {
        // If OTP is disabled, just submit the transfer with PIN only
        onFinalizeTransferWithoutOTP();
      }
  };
  
  const onFinalizeTransfer = async () => {
      if (!pin || pin.length !== 4) {
          toast({
              title: "Error",
              description: "Please enter your 4-digit transaction PIN",
              variant: "destructive"
          });
          return;
      }
      if (otpEnabled && (!otp || otp.length < 4)) {
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
          
          const payload: any = {
              bankCode: values.bankCode,
              accountNumber: values.accountNumber,
              accountName: values.accountName,
              amount: Number(values.amount),
              remark: values.remark || "",
              pin: pin,
              wallet_id: values.wallet_id
          };
          if (otpEnabled) {
              payload.otp = otp;
          }

          const response = await api.post("/transfers/single", payload);
          
          // Show success modal
          const selectedBank = banks.find(b => b.code === values.bankCode);
          setSuccessfulTransfer({
              amount: values.amount,
              bankName: selectedBank?.name || "Unknown Bank",
              accountNumber: values.accountNumber,
              accountName: values.accountName,
              remark: values.remark,
              reference: response.data?.data?.reference || `TXN-${Date.now()}`
          });
          setTransferOpen(false);
          setTransferStep("details");
          transferForm.reset();
          setOtp("");
          setPin("");
          setShowTransferSuccessModal(true);
          fetchWalletInfo();
      } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Transfer failed",
        variant: "destructive"
      });
    } finally {
          setTransferLoading(false);
      }
  };

  const onFinalizeTransferWithoutOTP = async () => {
    if (!pin || pin.length !== 4) {
      toast({
          title: "Error",
          description: "Please enter your 4-digit transaction PIN",
          variant: "destructive"
      });
      return;
    }
    
    try {
      setTransferLoading(true);
      const values = transferForm.getValues();
      
      const payload = {
          bankCode: values.bankCode,
          accountNumber: values.accountNumber,
          accountName: values.accountName,
          amount: Number(values.amount),
          remark: values.remark || "",
          pin: pin,
          wallet_id: values.wallet_id
      };

      const response = await api.post("/transfers/single", payload);
      
      // Show success modal
      const selectedBank = banks.find(b => b.code === values.bankCode);
      setSuccessfulTransfer({
          amount: values.amount,
          bankName: selectedBank?.name || "Unknown Bank",
          accountNumber: values.accountNumber,
          accountName: values.accountName,
          remark: values.remark,
          reference: response.data?.data?.reference || `TXN-${Date.now()}`
      });
      setTransferOpen(false);
      setTransferStep("details");
      transferForm.reset();
      setPin("");
      setShowTransferSuccessModal(true);
      fetchWalletInfo();
    } catch (error: any) {
    toast({
      title: "Error",
      description: error.response?.data?.error || error.response?.data?.message || "Transfer failed",
      variant: "destructive"
    });
  } finally {
      setTransferLoading(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      setOtpLoading(true);
      const values = transferForm.getValues();
      const requestData: any = { wallet_id: values.wallet_id };
      if (otpMethod) {
        requestData.otp_method = otpMethod;
      }
      await api.post("/transfers/otp/request", requestData);
      toast({ title: "OTP Sent", description: "New OTP sent." });
      startCountdown();
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to resend OTP", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleCreatePin = async () => {
    if (newPin.length !== 4) {
      toast({ title: "Error", description: "PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    try {
      await api.post("/settings/pin", { pin: newPin });
      setPinCreated(true);
      setShowCreatePinModal(false);
      setNewPin("");
      toast({ title: "Success", description: "PIN created successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to create PIN", variant: "destructive" });
    }
  };

  const handleSendResetPinOtp = async () => {
    try {
      await api.post("/settings/pin/send-otp");
      toast({ title: "OTP Sent", description: "OTP sent to reset PIN" });
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to send OTP", variant: "destructive" });
    }
  };

  const handleResetPin = async () => {
    if (newPin.length !== 4) {
      toast({ title: "Error", description: "PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    try {
      await api.put("/settings/pin", { newPin, otp: resetPinOtp });
      setPinCreated(true);
      setShowResetPinModal(false);
      setNewPin("");
      setResetPinOtp("");
      toast({ title: "Success", description: "PIN reset successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to reset PIN", variant: "destructive" });
    }
  };

  const fetchWalletInfo = async () => {
    try {
      const [walletRes, otpRes] = await Promise.all([
        api.get<WalletInfo>("/wallet"),
        api.get<OtpEnabledResponse>("/settings/otp-enabled"),
      ]);
      setWalletInfo(walletRes.data);
      if (otpRes.data.success) {
        setOtpEnabled(otpRes.data.otpEnabled);
        setPinCreated(otpRes.data.pinCreated);
      }
    } catch (error: any) {
      console.error("Failed to fetch wallet info", error);
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to load wallet information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletInfo();
  }, []);

  const onFundWallet = async (values: z.infer<typeof fundWalletSchema>) => {
    try {
      setFundingLoading(true);
      const wallet = selectedWalletType === "user" ? walletInfo?.user_wallet : walletInfo?.business_wallet;
      
      if (!wallet?.id) {
        toast({
          title: "Error",
          description: "Wallet not found",
          variant: "destructive",
        });
        return;
      }

      const response = await api.post("/wallet/fund/card", {
        amount: Number(values.amount),
        wallet_id: wallet.id,
        redirect_url: window.location.origin + "/payment-callback",
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
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to initiate payment",
        variant: "destructive",
      });
    } finally {
      setFundingLoading(false);
    }
  };

  const onCreateVirtualAccount = async (type: "Personal" | "Business") => {
    try {
      setCreatingVaLoading(type);
      await api.post("/wallet/create-virtual-account", { accountType: type } as CreateVirtualAccountInput);
      toast({
        title: "Success",
        description: "Virtual Account created successfully",
      });
      fetchWalletInfo();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to create virtual account",
        variant: "destructive",
      });
    } finally {
      setCreatingVaLoading(null);
    }
  };

  // Helper to get bank name from code
  const getBankName = (bankCode: string) => {
    const bankMap: Record<string, string> = {
      "035": "Wema Bank",
      "232": "Sterling Bank",
      "058": "Guaranty Trust Bank",
    };
    return bankMap[bankCode] || `Bank (${bankCode})`;
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

        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
          {/* Personal Wallet Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <WalletIcon className="h-4 w-4 text-muted-foreground" />
                Personal Wallet
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCreateVirtualAccount("Personal")}
                disabled={creatingVaLoading === "Personal"}
              >
                {creatingVaLoading === "Personal" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Create VA
              </Button>
            </CardHeader>
            <CardContent>
              {walletInfo?.user_wallet ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-2xl font-bold">
                      {walletInfo.user_wallet.currency} {Number(walletInfo.user_wallet.balance).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Available Balance</p>
                  </div>
                  
                  {/* Virtual Accounts */}
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Virtual Accounts</p>
                    </div>
                    
                    {walletInfo.user_wallet.virtual_accounts.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        No virtual accounts yet. Click "Create VA" to create one.
                      </div>
                    ) : (
                      walletInfo.user_wallet.virtual_accounts.map((va) => (
                        <div
                          key={va.id}
                          className={cn(
                            "p-3 rounded-lg border transition-all",
                            va.is_active
                              ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                              : "border-red-500 bg-red-50 dark:bg-red-950/20"
                          )}
                        >
                          {va.is_active && (
                            <div className="flex items-center gap-1 mb-2 text-green-700 dark:text-green-400 text-xs font-semibold">
                              <CheckCircle2 className="h-3 w-3" />
                              Active - Use This Account
                            </div>
                          )}
                          {!va.is_active && (
                            <div className="flex items-center gap-1 mb-2 text-red-700 dark:text-red-400 text-xs font-semibold">
                              <AlertCircle className="h-3 w-3" />
                              Inactive - Do Not Use
                            </div>
                          )}
                          
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-lg font-mono">{va.virtual_account_number}</span>
                              <span className="text-xs text-muted-foreground">{getBankName(va.bank_code)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{va.account_name}</p>
                            <p className="text-xs text-muted-foreground">Provider: {va.payment_provider}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-2 pt-3">
                    <Button 
                      className="w-full" 
                      onClick={() => {
                        setSelectedWalletType("user");
                        setFundWalletOpen(true);
                      }}
                    >
                      <CreditCard className="mr-2 h-4 w-4" /> Fund via Card
                    </Button>
                    <Button 
                      variant="outline"
                      className="w-full" 
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
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                   <p className="text-muted-foreground">No personal wallet found.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Business Wallet Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Business Wallet
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCreateVirtualAccount("Business")}
                disabled={creatingVaLoading === "Business"}
              >
                {creatingVaLoading === "Business" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Create VA
              </Button>
            </CardHeader>
            <CardContent>
              {walletInfo?.business_wallet ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-2xl font-bold">
                      {walletInfo.business_wallet.currency} {Number(walletInfo.business_wallet.balance).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Available Balance</p>
                  </div>
                  
                  {/* Virtual Accounts */}
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Virtual Accounts</p>
                    </div>
                    
                    {walletInfo.business_wallet.virtual_accounts.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        No virtual accounts yet. Click "Create VA" to create one.
                      </div>
                    ) : (
                      walletInfo.business_wallet.virtual_accounts.map((va) => (
                        <div
                          key={va.id}
                          className={cn(
                            "p-3 rounded-lg border transition-all",
                            va.is_active
                              ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                              : "border-red-500 bg-red-50 dark:bg-red-950/20"
                          )}
                        >
                          {va.is_active && (
                            <div className="flex items-center gap-1 mb-2 text-green-700 dark:text-green-400 text-xs font-semibold">
                              <CheckCircle2 className="h-3 w-3" />
                              Active - Use This Account
                            </div>
                          )}
                          {!va.is_active && (
                            <div className="flex items-center gap-1 mb-2 text-red-700 dark:text-red-400 text-xs font-semibold">
                              <AlertCircle className="h-3 w-3" />
                              Inactive - Do Not Use
                            </div>
                          )}
                          
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-lg font-mono">{va.virtual_account_number}</span>
                              <span className="text-xs text-muted-foreground">{getBankName(va.bank_code)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{va.account_name}</p>
                            <p className="text-xs text-muted-foreground">Provider: {va.payment_provider}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-2 pt-3">
                    <Button 
                      className="w-full" 
                      onClick={() => {
                        setSelectedWalletType("business");
                        setFundWalletOpen(true);
                      }}
                    >
                      <CreditCard className="mr-2 h-4 w-4" /> Fund via Card
                    </Button>
                    <Button 
                      variant="outline"
                      className="w-full" 
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
                <div className="flex items-center justify-center h-32">
                   <p className="text-muted-foreground">Business wallet will be created automatically after KYC approval.</p>
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
                        <Input type="number" placeholder="100" {...field} />
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
              setPin("");
              setOtpMethod("");
              setLookupName(null);
            }
        }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
                        <FormItem className="flex flex-col">
                          <FormLabel>Bank Name</FormLabel>
                          <Popover open={bankOpen} onOpenChange={setBankOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={bankOpen}
                                  className="w-full justify-between"
                                >
                                  {field.value
                                    ? banks.find(
                                        (bank) => bank.code === field.value
                                      )?.name
                                    : "Select bank"}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[350px] p-0">
                              <Command>
                                <CommandInput placeholder="Search bank..." />
                                <CommandList>
                                  <CommandEmpty>No bank found.</CommandEmpty>
                                  <CommandGroup>
                                    {banks.map((bank) => (
                                      <CommandItem
                                         value={bank.name}
                                         key={bank.code}
                                         onSelect={() => {
                                           field.onChange(bank.code);
                                           setBankOpen(false);
                                         }}
                                       >
                                        {bank.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
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
                                placeholder="Verified account name will appear here" 
                                {...field} 
                                readOnly
                                className="bg-muted"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {lookupError && (
                        <p className="text-sm text-destructive mt-1">
                            {lookupError}
                        </p>
                    )}

                    <FormField
                      control={transferForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (NGN)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="100" {...field} />
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
                            <Input placeholder="Transfer description" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <Label>Transaction PIN</Label>
                      <Input 
                        type="password" 
                        placeholder="Enter your PIN" 
                        value={pin} 
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} 
                        maxLength={4}
                      />
                      {!pinCreated && (
                        <Button variant="link" size="sm" onClick={() => setShowCreatePinModal(true)} className="p-0 h-auto">
                          Create PIN
                        </Button>
                      )}
                      {pinCreated && (
                        <Button variant="link" size="sm" onClick={() => setShowResetPinModal(true)} className="p-0 h-auto">
                          Forgot PIN?
                        </Button>
                      )}
                    </div>

                    {otpEnabled && (
                      <div className="space-y-2">
                        <Label>OTP Method (Optional)</Label>
                        <RadioGroup value={otpMethod} onValueChange={setOtpMethod} className="flex flex-col gap-2">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="" id="method-default" />
                            <Label htmlFor="method-default">Default</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="email" id="method-email" />
                            <Label htmlFor="method-email">Email</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="sms" id="method-sms" />
                            <Label htmlFor="method-sms">SMS</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="whatsapp" id="method-whatsapp" />
                            <Label htmlFor="method-whatsapp">WhatsApp</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    )}

                    <DialogFooter>
                      <Button type="submit" loading={otpLoading || transferLoading} disabled={!!lookupError || !lookupName}>
                        {otpEnabled ? "Request OTP" : "Confirm Transfer"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
            ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Enter OTP</Label>
                    <Input 
                      placeholder="123456" 
                      value={otp} 
                      onChange={(e) => setOtp(e.target.value)} 
                      maxLength={6}
                    />
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleResendOTP} 
                    disabled={isActive || otpLoading}
                    className="w-full"
                  >
                    {isActive ? `Resend OTP in ${seconds}s` : "Resend OTP"}
                  </Button>

                  <DialogFooter>
                    <Button 
                      variant="outline" 
                      onClick={() => setTransferStep("details")}
                    >
                      Back
                    </Button>
                    <Button 
                      onClick={onFinalizeTransfer} 
                      loading={transferLoading}
                    >
                      Confirm Transfer
                    </Button>
                  </DialogFooter>
                </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Create PIN Modal */}
        <Dialog open={showCreatePinModal} onOpenChange={setShowCreatePinModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Transaction PIN</DialogTitle>
              <DialogDescription>Create a 4-digit PIN for your transactions.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>New PIN</Label>
                <Input 
                  type="password" 
                  placeholder="Enter 4-digit PIN" 
                  value={newPin} 
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} 
                  maxLength={4}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreatePinModal(false)}>Cancel</Button>
                <Button onClick={handleCreatePin}>Create PIN</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reset PIN Modal */}
        <Dialog open={showResetPinModal} onOpenChange={setShowResetPinModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Transaction PIN</DialogTitle>
              <DialogDescription>Enter OTP to reset your PIN.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>OTP</Label>
                <Input 
                  placeholder="Enter OTP" 
                  value={resetPinOtp} 
                  onChange={(e) => setResetPinOtp(e.target.value)} 
                />
                <Button variant="ghost" size="sm" onClick={handleSendResetPinOtp} className="p-0 h-auto">
                  Send OTP
                </Button>
              </div>
              <div className="space-y-2">
                <Label>New PIN</Label>
                <Input 
                  type="password" 
                  placeholder="Enter 4-digit PIN" 
                  value={newPin} 
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} 
                  maxLength={4}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowResetPinModal(false)}>Cancel</Button>
                <Button onClick={handleResetPin}>Reset PIN</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Transfer Success Modal */}
        <Dialog open={showTransferSuccessModal} onOpenChange={setShowTransferSuccessModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-6 w-6" /> Transfer Successful!
              </DialogTitle>
            </DialogHeader>
            {successfulTransfer && (
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono">{successfulTransfer.reference}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold">NGN {Number(successfulTransfer.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Bank</span>
                  <span>{successfulTransfer.bankName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Account Number</span>
                  <span>{successfulTransfer.accountNumber}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Account Name</span>
                  <span>{successfulTransfer.accountName}</span>
                </div>
                {successfulTransfer.remark && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Remark</span>
                    <span>{successfulTransfer.remark}</span>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => {
                setShowTransferSuccessModal(false);
                setSuccessfulTransfer(null);
              }}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
