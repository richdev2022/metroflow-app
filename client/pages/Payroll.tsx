import React, { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { PayrollEmployee, Transfer, WalletInfo, PayrollAdjustment, PayrollConfig, Epic, TransferItem, OtpEnabledResponse } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, DollarSign, Plus, Minus, Check, ChevronsUpDown, MoreHorizontal, Trash2, Search as SearchIcon, ChevronLeft, ChevronRight, Filter, Calendar as CalendarIcon, Settings, User, CreditCard, FileText, Users, ArrowRightLeft, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCountdown } from "@/hooks/useCountdown";

const updatePayrollSchema = z.object({
  salary: z.string().min(1, "Salary is required"),
  salary_currency: z.string().min(1, "Currency is required"),
  bank_code: z.string().min(1, "Bank Code is required"),
  bank_account_number: z.string().length(10, "Account number must be 10 digits"),
  account_name: z.string().min(1, "Account name is required"),
  contract_start_date: z.string().optional(),
});

const configSchema = z.object({
  salary_interval: z.enum(["daily", "weekly", "monthly", "yearly", "custom"]),
  salary_custom_date: z.string().optional().nullable(),
});

const adjustmentSchema = z.object({
  type: z.enum(["bonus", "deduction"]),
  amount: z.string().min(1, "Amount is required"),
  reason: z.string().min(3, "Reason is required"),
});

const bulkTransferSchema = z.object({
  source_wallet_id: z.string().min(1, "Source wallet is required"),
  type: z.enum(["salary", "epic"]),
  otp: z.string().optional(),
  epic_id: z.string().optional(),
});

export default function Payroll() {
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [wallets, setWallets] = useState<WalletInfo | null>(null);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollEmployee | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [bulkTransferDialogOpen, setBulkTransferDialogOpen] = useState(false);
  const [employeeAdjustments, setEmployeeAdjustments] = useState<PayrollAdjustment[]>([]);
  const [banks, setBanks] = useState<{code: string, name: string}[]>([]);
  const [accountName, setAccountName] = useState<string>("");
  const [openBank, setOpenBank] = useState(false);
  
  // Config State
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [payrollConfig, setPayrollConfig] = useState<PayrollConfig | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter & Pagination States - Payroll
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  
  // Filter & Pagination States - Transfers
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [transferPage, setTransferPage] = useState(1);
  const [transferTotal, setTransferTotal] = useState(0);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferStatus, setTransferStatus] = useState("all");
  const [transferLimit, setTransferLimit] = useState(10);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [transferDetailDialogOpen, setTransferDetailDialogOpen] = useState(false);
  
  // Bulk Transfer State
  const [epicTransferItems, setEpicTransferItems] = useState<TransferItem[]>([]);
  const [bulkTransferStep, setBulkTransferStep] = useState<"select" | "review" | "otp" | "success">("select");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [transferSuccessData, setTransferSuccessData] = useState<any>(null);
  const [epicTransferMode, setEpicTransferMode] = useState<"single" | "bulk">("bulk");
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [openBankPopover, setOpenBankPopover] = useState<number | null>(null);
  // Add lookup status per recipient (index-based)
  const [recipientLookupStatus, setRecipientLookupStatus] = useState<Record<number, { loading: boolean; success: boolean; name: string; error?: string }>>({});
  const { seconds, isActive, startCountdown } = useCountdown();

  // New security state
  const [pin, setPin] = useState("");
  const [otpMethod, setOtpMethod] = useState<string>("");
  const [otpEnabled, setOtpEnabled] = useState(true);
  const [pinCreated, setPinCreated] = useState(false);
  const [showCreatePinModal, setShowCreatePinModal] = useState(false);
  const [showResetPinModal, setShowResetPinModal] = useState(false);
  const [resetPinOtp, setResetPinOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  
  // Effect to auto-lookup recipient accounts
  useEffect(() => {
    const lookupRecipients = async () => {
      for (let index = 0; index < epicTransferItems.length; index++) {
        const item = epicTransferItems[index];
        const currentStatus = recipientLookupStatus[index];
        
        // If we have both bank and account number (10 digits)
        if (item.recipient_bank && item.recipient_account && item.recipient_account.length === 10) {
          // Don't re-lookup if we already have a success or are loading
          if (currentStatus?.success || currentStatus?.loading) continue;
          
          // Mark as loading
          setRecipientLookupStatus(prev => ({
            ...prev,
            [index]: { loading: true, success: false, name: "" }
          }));
          
          try {
            const res = await api.post("/transfers/account-lookup", {
              bank_code: item.recipient_bank,
              account_number: item.recipient_account
            });
            
            let name = "";
            if (res.data.data?.responseBody?.accountName) {
              name = res.data.data.responseBody.accountName;
            } else if (res.data.data?.account_name) {
              name = res.data.data.account_name;
            } else if (res.data.data?.accountName) {
              name = res.data.data.accountName;
            }
            
            // Update recipient name and status
            updateRecipient(`recipient_${index}`, "recipient_name", name);
            setRecipientLookupStatus(prev => ({
              ...prev,
              [index]: { loading: false, success: true, name }
            }));
          } catch (error: any) {
            // Update status to failed
            const errorMsg = error.response?.data?.error || error.response?.data?.message || "Could not verify account name";
            setRecipientLookupStatus(prev => ({
              ...prev,
              [index]: { loading: false, success: false, name: "", error: errorMsg }
            }));
          }
        } else {
          // Reset status if conditions aren't met
          if (currentStatus) {
            setRecipientLookupStatus(prev => {
              const newStatus = { ...prev };
              delete newStatus[index];
              return newStatus;
            });
            updateRecipient(`recipient_${index}`, "recipient_name", "");
          }
        }
      }
    };
    
    lookupRecipients();
  }, [epicTransferItems]);

  const updateForm = useForm<z.infer<typeof updatePayrollSchema>>({
    resolver: zodResolver(updatePayrollSchema),
    defaultValues: { salary: "", salary_currency: "NGN", bank_code: "", bank_account_number: "", account_name: "", contract_start_date: "" },
  });

  const configForm = useForm<z.infer<typeof configSchema>>({
    resolver: zodResolver(configSchema),
    defaultValues: { salary_interval: "monthly", salary_custom_date: null },
  });
  
  const watchInterval = configForm.watch("salary_interval");

  const watchBankCode = updateForm.watch("bank_code");
  const watchAccountNumber = updateForm.watch("bank_account_number");

  useEffect(() => {
    const lookup = async () => {
        if (watchBankCode && watchAccountNumber && watchAccountNumber.length === 10) {
            setAccountName("Verifying...");
            try {
                const res = await api.post("/transfers/account-lookup", {
                    bank_code: watchBankCode,
                    account_number: watchAccountNumber
                });
                if (res.data.success) {
                    let name = "";
                    if (res.data.data?.responseBody?.accountName) {
                        name = res.data.data.responseBody.accountName;
                    } else if (res.data.data?.account_name) {
                        name = res.data.data.account_name;
                    } else if (res.data.data?.accountName) {
                        name = res.data.data.accountName;
                    }
                    setAccountName(name);
                    updateForm.setValue("account_name", name);
                } else {
                     setAccountName("Not found");
                }
            } catch (e) {
                setAccountName("Lookup failed");
            }
        } else {
            setAccountName("");
        }
    };
    const timer = setTimeout(lookup, 500); // Debounce
    return () => clearTimeout(timer);
  }, [watchBankCode, watchAccountNumber, updateForm]);

  const adjustmentForm = useForm<z.infer<typeof adjustmentSchema>>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { type: "bonus", amount: "", reason: "" },
  });

  const bulkTransferForm = useForm<z.infer<typeof bulkTransferSchema>>({
    resolver: zodResolver(bulkTransferSchema),
    defaultValues: { source_wallet_id: "", type: "salary", epic_id: "" },
  });

  const fetchEmployees = async (currentPage = page) => {
    try {
      const queryParams = new URLSearchParams();
      if (searchQuery) queryParams.append("search", searchQuery);
      if (roleFilter && roleFilter !== "all") queryParams.append("role", roleFilter);
      if (startDate) queryParams.append("startDate", startDate);
      if (endDate) queryParams.append("endDate", endDate);
      queryParams.append("page", currentPage.toString());
      queryParams.append("limit", limit.toString());

      const res = await api.get<{success: boolean, payroll: PayrollEmployee[], pagination: any}>(`/payroll/summary?${queryParams.toString()}`);
      if (res.data.success) {
        setEmployees(res.data.payroll || []);
      } else {
        setEmployees([]);
      }
    } catch (error: any) {
      console.error("Failed to fetch employees", error);
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to load employee data",
        variant: "destructive",
      });
    }
  };

  const fetchTransfers = async (currentPage = transferPage) => {
    try {
      const queryParams = new URLSearchParams();
      if (transferSearch) queryParams.append("search", transferSearch);
      if (transferStatus && transferStatus !== "all") queryParams.append("status", transferStatus);
      queryParams.append("page", currentPage.toString());
      queryParams.append("limit", transferLimit.toString());

      const res = await api.get<{
          success: boolean, 
          data: Transfer[], 
          pagination: { total: number, page: number, limit: number } 
      }>(`/transfers?${queryParams.toString()}`);
      
      if (res.data.success) {
          setTransfers(res.data.data);
          setTransferTotal(res.data.pagination.total);
      } else {
          setTransfers([]);
      }
    } catch (error: any) {
      console.error("Failed to fetch transfers", error);
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to load transfer history",
        variant: "destructive",
      });
    }
  };

  const fetchConfig = async () => {
    try {
        const res = await api.get<{success: boolean, data: PayrollConfig}>("/payroll/config");
        if (res.data.success) {
            setPayrollConfig(res.data.data);
            configForm.reset({
                salary_interval: res.data.data.salary_interval,
                salary_custom_date: res.data.data.salary_custom_date
            });
        }
    } catch (error) {
        console.error("Failed to fetch config");
    }
  };

  const fetchEpics = async () => {
    try {
      const res = await api.get<{success: boolean, data: Epic[]}>("/epics");
      if (res.data.success) {
        setEpics(res.data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch epics");
    }
  };

  const onUpdateConfig = async (values: z.infer<typeof configSchema>) => {
      try {
          const res = await api.put("/payroll/config", values);
          if (res.data.success) {
              toast({ title: "Success", description: "Configuration updated" });
              setConfigDialogOpen(false);
              fetchConfig();
          }
      } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to update configuration", variant: "destructive" });
    }
  };

  const fetchData = async () => {
    try {
      fetchEmployees(1);
      fetchConfig();
      fetchEpics();
      fetchTransfers(1);

      const [walletRes, banksRes, otpEnabledRes] = await Promise.all([
        api.get<WalletInfo>("/wallet"),
        api.get<{success: boolean, data: {code: string, name: string}[]}>("/transfers/banks"),
        api.get<OtpEnabledResponse>("/settings/otp-enabled")
      ]);
      
      setWallets(walletRes.data);
      if (banksRes.data.success) {
        setBanks(banksRes.data.data);
      }
      if (otpEnabledRes.data.success) {
        setOtpEnabled(otpEnabledRes.data.otpEnabled);
        setPinCreated(otpEnabledRes.data.pinCreated);
      }
    } catch (error: any) {
      console.error("Failed to fetch data", error);
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Effect to refetch when page changes (but not when filters change, to allow "Search" button)
  useEffect(() => {
    if (!loading) {
       fetchEmployees(page);
    }
  }, [page]);

  const handlePayrollSearch = () => {
    setPage(1);
    fetchEmployees(1);
  };

  const handleTransferSearch = () => {
    setTransferPage(1);
    fetchTransfers(1);
  };

  const fetchAdjustments = async (userId: string) => {
    try {
      const res = await api.get<{success: boolean, data: PayrollAdjustment[]}>(`/payroll/adjustments?userId=${userId}`);
      if (res.data.success) {
        setEmployeeAdjustments(res.data.data || []);
      }
    } catch (e) {
      console.error("Failed to fetch adjustments");
    }
  };

  const deleteAdjustment = async (id: string) => {
    try {
      await api.delete(`/payroll/adjustments/${id}`);
      toast({ title: "Success", description: "Adjustment deleted" });
      if (selectedEmployee) {
        fetchAdjustments(selectedEmployee.id);
        fetchData();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.response?.data?.error || e.response?.data?.message || "Failed to delete adjustment", variant: "destructive" });
    }
  };

  const onUpdatePayroll = async (values: z.infer<typeof updatePayrollSchema>) => {
    if (!selectedEmployee) return;
    setIsUpdating(true);
    try {
      await api.put(`/payroll/user/${selectedEmployee.id}`, {
        ...values,
        salary: Number(values.salary),
      });
      toast({ title: "Success", description: "Payroll details updated" });
      setUpdateDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to update details", variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  const onAddAdjustment = async (values: z.infer<typeof adjustmentSchema>) => {
    if (!selectedEmployee) return;
    try {
      await api.post("/payroll/adjustments", {
        userId: selectedEmployee.id,
        ...values,
        amount: Number(values.amount),
        currency: "NGN",
      });
      toast({ title: "Success", description: "Adjustment added" });
      setAdjustmentDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to add adjustment", variant: "destructive" });
    }
  };

  const handleResendOTP = async () => {
    try {
      setOtpLoading(true);
      const values = bulkTransferForm.getValues();
      const requestData: any = { wallet_id: values.source_wallet_id };
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

  const retryTransfer = async (id: string) => {
    setRetryingId(id);
    try {
      await api.post(`/transfers/${id}/retry`);
      toast({ title: "Success", description: "Transfer retry initiated" });
      fetchTransfers();
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to retry transfer", variant: "destructive" });
    } finally {
      setRetryingId(null);
    }
  };

  const printReceipt = () => {
    const printContents = document.getElementById('receipt-content')?.innerHTML;
    if (!printContents) return;

    const originalContents = document.body.innerHTML;

    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Transfer Receipt</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 2rem;
              max-width: 800px;
              margin: 0 auto;
            }
            .receipt-header {
              text-align: center;
              border-bottom: 2px solid #e5e7eb;
              padding-bottom: 1rem;
              margin-bottom: 1rem;
            }
            .receipt-section {
              margin-bottom: 1rem;
            }
            .receipt-label {
              font-size: 0.875rem;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .receipt-value {
              font-size: 1rem;
              font-weight: 500;
            }
            .receipt-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 1rem;
            }
            .status-success {
              color: #10b981;
            }
            .status-failed {
              color: #ef4444;
            }
            .status-pending {
              color: #f59e0b;
            }
          </style>
        </head>
        <body>
          ${printContents}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const openBulkTransfer = () => {
    setBulkTransferStep("select");
    setOtpSent(false);
    setEpicTransferItems([]);
    setEpicTransferMode("bulk");
    setEditingRecipientId(null);
    bulkTransferForm.reset();
    setBulkTransferDialogOpen(true);
  };

  const onGoToReviewStep = async (values: z.infer<typeof bulkTransferSchema>) => {
    try {
      setOtpLoading(true);
      // Start with appropriate recipients for epic transfers
      if (values.type === "epic") {
        if (epicTransferMode === "single") {
          // Single mode starts with one recipient
          setEpicTransferItems([
            {
              recipient_account: "",
              recipient_bank: "",
              recipient_name: "",
              amount: 0,
              remark: epics.find(e => e.id === values.epic_id)?.name || "",
              source_type: "epic",
              source_id: values.epic_id || ""
            }
          ]);
        } else {
          // Bulk mode starts empty
          setEpicTransferItems([]);
        }
      }
      setBulkTransferStep("review");
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to proceed", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const onRequestOtp = async () => {
    try {
      setOtpLoading(true);
      const values = bulkTransferForm.getValues();
      await api.post("/transfers/otp/request", { wallet_id: values.source_wallet_id });
      setOtpSent(true);
      setBulkTransferStep("otp");
      startCountdown();
      toast({ title: "OTP Sent", description: "Please enter the OTP sent to your registered contact." });
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to send OTP", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const addRecipient = () => {
    const values = bulkTransferForm.getValues();
    const selectedEpic = epics.find(e => e.id === values.epic_id);
    setEpicTransferItems([
      ...epicTransferItems,
      {
        recipient_account: "",
        recipient_bank: "",
        recipient_name: "",
        amount: 0,
        remark: selectedEpic?.name || "",
        source_type: "epic",
        source_id: values.epic_id || ""
      }
    ]);
  };

  const removeRecipient = (id: string) => {
    setEpicTransferItems(epicTransferItems.filter((_, index) => `recipient_${index}` !== id));
  };

  const updateRecipient = (id: string, field: keyof TransferItem, value: any) => {
    if (field === "remark") return; // Don't allow changing remark
    setEpicTransferItems(
      epicTransferItems.map((item, index) => {
        if (`recipient_${index}` === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const verifyRecipientAccount = async (id: string) => {
    const recipient = epicTransferItems.find((_, index) => `recipient_${index}` === id);
    if (!recipient || !recipient.recipient_bank || !recipient.recipient_account) {
      toast({ title: "Error", description: "Please select a bank and enter account number", variant: "destructive" });
      return;
    }
    try {
      const res = await api.post("/transfers/account-lookup", {
        bank_code: recipient.recipient_bank,
        account_number: recipient.recipient_account
      });
      if (res.data.success) {
        let name = "";
        if (res.data.data?.responseBody?.accountName) {
          name = res.data.data.responseBody.accountName;
        } else if (res.data.data?.account_name) {
          name = res.data.data.account_name;
        } else if (res.data.data?.accountName) {
          name = res.data.data.accountName;
        }
        updateRecipient(id, "recipient_name", name);
        toast({ title: "Success", description: "Account verified successfully" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to verify account", variant: "destructive" });
    }
  };

  const onFinalizeBulkTransfer = async (otp: string) => {
    if (otpEnabled && !otp) {
      toast({ title: "Error", description: "Please enter OTP", variant: "destructive" });
      return;
    }
    if (!pin || pin.length !== 4) {
      toast({ title: "Error", description: "Please enter your 4-digit PIN", variant: "destructive" });
      return;
    }
    try {
      const values = bulkTransferForm.getValues();
      let items: any[] = [];
      let transferType: "Salary" | "Epic" = "Salary";

      if (values.type === "salary") {
        transferType = "Salary";
        items = employees.map(emp => ({
          bankCode: emp.bank_code || "",
          accountNumber: emp.bank_account_number || emp.account_number || "",
          accountName: emp.account_name || emp.name,
          amount: emp.net_salary,
          remark: "Salary Payment"
        }));
      } else if (values.type === "epic" && epicTransferItems.length > 0) {
        transferType = "Epic";
        const selectedEpic = epics.find(e => e.id === values.epic_id);
        items = epicTransferItems.map(item => ({
          bankCode: item.recipient_bank,
          accountNumber: item.recipient_account,
          accountName: item.recipient_name,
          amount: item.amount,
          remark: selectedEpic?.name || ""
        }));
      }

      // Check if it's single transfer mode
      if (values.type === "epic" && epicTransferMode === "single" && items.length === 1) {
        const item = items[0];
        const payload: any = {
          bankCode: item.bankCode,
          accountNumber: item.accountNumber,
          accountName: item.accountName,
          amount: item.amount,
          remark: item.remark,
          otp: otp,
          pin: pin,
          wallet_id: values.source_wallet_id
        };
        
        const response = await api.post("/transfers/single", payload);
        if (response.data.success) {
          setTransferSuccessData({
            queued: 1,
            type: "Single Epic",
            message: response.data.message,
            totals: {
              amount: item.amount,
              fee: response.data.data.fee || 0,
              total: (Number(item.amount) || 0) + (response.data.data.fee || 0)
            },
            transfers: [response.data.data]
          });
          setBulkTransferStep("success");
          fetchData();
          fetchTransfers();
        }
      } else {
        const payload: any = {
          type: transferType,
          otp: otp,
          pin: pin,
          source_wallet_id: values.source_wallet_id,
          data: { items }
        };

        const response = await api.post("/transfers/bulk", payload);
        if (response.data.success) {
          setTransferSuccessData({
            ...response.data.data,
            message: response.data.message
          });
          setBulkTransferStep("success");
          fetchData();
          fetchTransfers();
        }
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to initiate transfer", variant: "destructive" });
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
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Payroll</h2>
            <p className="text-muted-foreground">Manage payroll, transfers, and employee salaries.</p>
          </div>
          <div className="flex gap-2">
             <Button variant="outline" onClick={() => setConfigDialogOpen(true)}>
               <Settings className="mr-2 h-4 w-4" /> Configuration
             </Button>
             <Button onClick={openBulkTransfer}>
               <ArrowRightLeft className="mr-2 h-4 w-4" /> Bulk Transfer
             </Button>
           </div>
        </div>

        <Tabs defaultValue="payroll" className="w-full">
          <TabsList>
            <TabsTrigger value="payroll">
              <Users className="mr-2 h-4 w-4" />
              Payroll
            </TabsTrigger>
            <TabsTrigger value="transfers">
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transfers
            </TabsTrigger>
          </TabsList>

          {/* Payroll Tab */}
          <TabsContent value="payroll" className="space-y-6">
            <div className="space-y-4">
                <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-lg border shadow-sm">
                  <div className="grid w-full max-w-sm items-center gap-1.5">
                    <p className="text-sm font-medium">Search</p>
                    <div className="relative">
                       <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                       <Input 
                          placeholder="Name or Email" 
                          className="pl-8" 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                       />
                    </div>
                  </div>
                  
                  <div className="grid w-full max-w-[150px] items-center gap-1.5">
                     <p className="text-sm font-medium">Role</p>
                     <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="All Roles" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Roles</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>

                  <div className="grid w-full max-w-[150px] items-center gap-1.5">
                     <p className="text-sm font-medium">Start Date</p>
                     <Input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                     />
                  </div>

                  <div className="grid w-full max-w-[150px] items-center gap-1.5">
                     <p className="text-sm font-medium">End Date</p>
                     <Input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                     />
                  </div>

                  <Button onClick={handlePayrollSearch}>
                    <Filter className="mr-2 h-4 w-4" /> Filter
                  </Button>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Employee Payroll</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Net Pay</TableHead>
                          <TableHead>Next Pay Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.isArray(employees) && employees.map((emp) => (
                          <TableRow key={emp.id}>
                            <TableCell>
                                <div className="font-medium">{emp.name}</div>
                                <div className="text-xs text-muted-foreground">{emp.email}</div>
                            </TableCell>
                            <TableCell className="capitalize">{emp.role}</TableCell>
                            <TableCell className="font-bold">{emp.salary_currency} {Number(emp.net_salary).toLocaleString()}</TableCell>
                            <TableCell>{emp.next_pay_date}</TableCell>
                            <TableCell>
                                <Badge variant={emp.salary_calculation_status === 'ready' ? 'default' : 'secondary'}>
                                    {emp.salary_calculation_status || 'standard'}
                                </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                 <Button variant="ghost" size="icon" onClick={() => {
                                  setSelectedEmployee(emp);
                                  fetchAdjustments(emp.id);
                                  setDetailDialogOpen(true);
                                }}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => {
                                  setSelectedEmployee(emp);
                                  updateForm.reset({
                                    salary: emp.salary.toString(),
                                    salary_currency: emp.salary_currency,
                                    bank_code: emp.bank_code || "",
                                    bank_account_number: emp.bank_account_number || emp.account_number || "",
                                    account_name: emp.account_name || "",
                                    contract_start_date: emp.contract_start_date ? emp.contract_start_date.split('T')[0] : "",
                                  });
                                  setUpdateDialogOpen(true);
                                }}>Edit</Button>
                                <Button variant="ghost" size="sm" onClick={() => {
                                  setSelectedEmployee(emp);
                                  adjustmentForm.reset();
                                  setAdjustmentDialogOpen(true);
                                }}>Adjust</Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    
                    <div className="flex items-center justify-end space-x-2 py-4 border-t mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Previous
                        </Button>
                        <div className="text-sm font-medium">Page {page}</div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => p + 1)}
                          disabled={employees.length < limit}
                        >
                          Next
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
          </TabsContent>

          {/* Transfers Tab */}
          <TabsContent value="transfers" className="space-y-6">
            <div className="space-y-4">
                <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-lg border shadow-sm">
                  <div className="grid w-full max-w-sm items-center gap-1.5">
                    <p className="text-sm font-medium">Search</p>
                    <div className="relative">
                       <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                       <Input 
                          placeholder="Recipient Name" 
                          className="pl-8" 
                          value={transferSearch}
                          onChange={(e) => setTransferSearch(e.target.value)}
                       />
                    </div>
                  </div>
                  
                  <div className="grid w-full max-w-[150px] items-center gap-1.5">
                     <p className="text-sm font-medium">Status</p>
                     <Select value={transferStatus} onValueChange={setTransferStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="success">Success</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>

                  <Button onClick={handleTransferSearch}>
                    <Filter className="mr-2 h-4 w-4" /> Filter
                  </Button>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Transfer History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Recipient</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.isArray(transfers) && transfers.map((transfer) => (
                          <TableRow 
                            key={transfer.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              setSelectedTransfer(transfer);
                              setTransferDetailDialogOpen(true);
                            }}
                          >
                            <TableCell>
                                <div className="font-medium">{transfer.recipient_name}</div>
                            </TableCell>
                            <TableCell className="font-bold">{transfer.currency} {Number(transfer.amount).toLocaleString()}</TableCell>
                            <TableCell>
                                <Badge variant={
                                    transfer.status === 'success' ? 'default' : 
                                    transfer.status === 'failed' ? 'destructive' : 'secondary'
                                }>
                                    {transfer.status}
                                </Badge>
                            </TableCell>
                            <TableCell>{transfer.created_at ? format(new Date(transfer.created_at), "MMM d, yyyy") : ""}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {transfer.status === 'failed' && (
                                <Button variant="ghost" size="sm" onClick={() => retryTransfer(transfer.id)} disabled={retryingId === transfer.id}>
                                  {retryingId === transfer.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry"}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    
                    <div className="flex items-center justify-end space-x-2 py-4 border-t mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTransferPage(p => Math.max(1, p - 1))}
                          disabled={transferPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Previous
                        </Button>
                        <div className="text-sm font-medium">Page {transferPage}</div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTransferPage(p => p + 1)}
                          disabled={transfers.length < transferLimit}
                        >
                          Next
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
          </TabsContent>
        </Tabs>

        {/* Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="w-[90vw] max-h-[85vh] overflow-y-auto sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Employee Payroll Details</DialogTitle>
              <DialogDescription>Comprehensive view of employee payroll and adjustments.</DialogDescription>
            </DialogHeader>
            {selectedEmployee && (
              <div className="space-y-6">
                
                {/* Section 1: Personal & Employment Details */}
                <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <User className="mr-2 h-5 w-5 text-primary" />
                        Personal & Employment
                    </h3>
                    <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border">
                        <div>
                            <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Name</h4>
                            <p className="font-medium">{selectedEmployee.name}</p>
                        </div>
                        <div>
                            <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Email</h4>
                            <p className="font-medium">{selectedEmployee.email}</p>
                        </div>
                        <div>
                            <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Role</h4>
                            <Badge variant="outline" className="capitalize mt-1">{selectedEmployee.role}</Badge>
                        </div>
                        <div>
                            <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Status</h4>
                            <Badge variant={selectedEmployee.salary_calculation_status === 'ready' ? 'default' : 'secondary'} className="mt-1">
                                {selectedEmployee.salary_calculation_status || 'standard'}
                            </Badge>
                        </div>
                        <div>
                            <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Contract Start</h4>
                            <p className="font-medium">{selectedEmployee.contract_start_date ? format(new Date(selectedEmployee.contract_start_date), "PPP") : "N/A"}</p>
                        </div>
                        <div>
                             <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Employee ID</h4>
                             <p className="text-xs text-muted-foreground truncate" title={selectedEmployee.id}>{selectedEmployee.id}</p>
                        </div>
                    </div>
                </div>

                {/* Section 2: Financial Overview */}
                <div>
                     <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <DollarSign className="mr-2 h-5 w-5 text-primary" />
                        Financial Overview
                    </h3>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-background p-4 rounded-lg border shadow-sm text-center">
                            <span className="text-xs text-muted-foreground font-medium uppercase">Base Salary</span>
                            <div className="text-xl font-bold mt-1">
                                {selectedEmployee.salary_currency} {Number(selectedEmployee.salary).toLocaleString()}
                            </div>
                        </div>
                        <div className="bg-background p-4 rounded-lg border shadow-sm text-center">
                            <span className="text-xs text-muted-foreground font-medium uppercase">Next Pay Date</span>
                            <div className="text-lg font-semibold mt-1">
                                {selectedEmployee.next_pay_date ? format(new Date(selectedEmployee.next_pay_date), "MMM d, yyyy") : "N/A"}
                            </div>
                        </div>
                        <div className="bg-primary/10 p-4 rounded-lg border border-primary/20 text-center">
                            <span className="text-xs text-primary font-bold uppercase">Net Pay</span>
                            <div className="text-xl font-bold text-primary mt-1">
                                {selectedEmployee.salary_currency} {Number(selectedEmployee.net_salary).toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section 3: Bank Details */}
                <div>
                     <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <CreditCard className="mr-2 h-5 w-5 text-primary" />
                        Bank Details
                    </h3>
                     <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border">
                        <div className="col-span-2 sm:col-span-1">
                            <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Bank Name</h4>
                             <p className="font-medium">
                                {selectedEmployee.bank_code 
                                    ? (banks.find(b => b.code === selectedEmployee.bank_code)?.name || selectedEmployee.bank_code) 
                                    : "N/A"}
                             </p>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Account Number</h4>
                            <p className="font-medium font-mono">{selectedEmployee.bank_account_number || selectedEmployee.account_number || "N/A"}</p>
                        </div>
                        <div className="col-span-2">
                            <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Account Name</h4>
                            <p className="font-medium">{selectedEmployee.account_name || "N/A"}</p>
                        </div>
                     </div>
                </div>

                {/* Section 4: Adjustments Breakdown */}
                <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <FileText className="mr-2 h-5 w-5 text-primary" />
                        Adjustments Breakdown
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-green-50 p-3 rounded-md border border-green-100 flex justify-between items-center">
                            <span className="text-sm text-green-700 font-medium">Total Bonuses</span>
                            <span className="text-lg font-bold text-green-700">
                                +{selectedEmployee.salary_currency} {selectedEmployee.adjustments?.bonuses.toLocaleString() ?? 0}
                            </span>
                        </div>
                        <div className="bg-red-50 p-3 rounded-md border border-red-100 flex justify-between items-center">
                            <span className="text-sm text-red-700 font-medium">Total Deductions</span>
                            <span className="text-lg font-bold text-red-700">
                                -{selectedEmployee.salary_currency} {selectedEmployee.adjustments?.deductions.toLocaleString() ?? 0}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Bonus List */}
                        {(selectedEmployee.adjustments?.bonus_list || []).length > 0 ? (
                            <div className="border rounded-md overflow-hidden">
                                <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Bonus Details</div>
                                <div className="divide-y">
                                    {(selectedEmployee.adjustments?.bonus_list || []).map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-3 text-sm">
                                            <span>{item.type === 'bonus' ? 'Bonus' : item.type}</span>
                                            <span className="font-medium text-green-600">+{item.currency} {Number(item.amount).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                             <p className="text-sm text-muted-foreground italic">No specific bonuses recorded.</p>
                        )}

                        {/* Deduction List */}
                        {(selectedEmployee.adjustments?.deduction_list || []).length > 0 ? (
                            <div className="border rounded-md overflow-hidden">
                                <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Deduction Details</div>
                                <div className="divide-y">
                                    {(selectedEmployee.adjustments?.deduction_list || []).map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-3 text-sm">
                                            <span>{item.type === 'deduction' ? 'Deduction' : item.type}</span>
                                            <span className="font-medium text-red-600">-{item.currency} {Number(item.amount).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                             <p className="text-sm text-muted-foreground italic">No specific deductions recorded.</p>
                        )}
                    </div>
                </div>

                {/* Legacy Adjustments */}
                {(employeeAdjustments || []).length > 0 && (
                     <div className="border-t pt-4">
                        <h4 className="font-semibold mb-2 text-sm text-muted-foreground">Manual Adjustments</h4>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                <TableHead>Type</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {employeeAdjustments.map((adj) => (
                                <TableRow key={adj.id}>
                                    <TableCell className="capitalize">{adj.type}</TableCell>
                                    <TableCell>{adj.currency} {Number(adj.amount).toLocaleString()}</TableCell>
                                    <TableCell>{adj.reason}</TableCell>
                                    <TableCell>
                                    <Button variant="ghost" size="sm" onClick={() => deleteAdjustment(adj.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                    </TableCell>
                                </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Transfer Detail Dialog */}
        <Dialog open={transferDetailDialogOpen} onOpenChange={setTransferDetailDialogOpen}>
          <DialogContent className="w-[90vw] max-h-[85vh] overflow-y-auto sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Transfer Receipt</DialogTitle>
              <DialogDescription>Complete details of the transfer transaction.</DialogDescription>
            </DialogHeader>
            {selectedTransfer && (
              <div className="space-y-6">
                {/* Receipt Content */}
                <div id="receipt-content">
                  {/* Header */}
                  <div className="receipt-header text-center border-b border-gray-200 pb-4 mb-4">
                    <h2 className="text-xl font-bold">Transfer Receipt</h2>
                    <p className="text-sm text-muted-foreground">{format(new Date(selectedTransfer.created_at), "MMMM d, yyyy")}</p>
                  </div>

                  {/* Transaction Details */}
                  <div className="receipt-section mb-4">
                    <h3 className="text-lg font-semibold mb-3">Transaction Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Reference</div>
                        <div className="font-medium font-mono">{selectedTransfer.reference}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Status</div>
                        <div className={`font-semibold ${
                          selectedTransfer.status === 'success' ? 'text-green-600' : 
                          selectedTransfer.status === 'failed' ? 'text-red-600' : 'text-yellow-600'
                        }`}>
                          {selectedTransfer.status.toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Source Type</div>
                        <div className="font-medium">{selectedTransfer.source_type || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Payment Provider</div>
                        <div className="font-medium">{selectedTransfer.payment_provider || "N/A"}</div>
                      </div>
                    </div>
                  </div>

                  {/* Recipient Details */}
                  <div className="receipt-section mb-4">
                    <h3 className="text-lg font-semibold mb-3">Recipient Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Name</div>
                        <div className="font-medium">{selectedTransfer.recipient_name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Account Number</div>
                        <div className="font-medium font-mono">{selectedTransfer.recipient_account || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Bank Code</div>
                        <div className="font-medium font-mono">{selectedTransfer.recipient_bank || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Bank Name</div>
                        <div className="font-medium">
                          {selectedTransfer.recipient_bank 
                            ? (banks.find(b => b.code === selectedTransfer.recipient_bank)?.name || selectedTransfer.recipient_bank) 
                            : "N/A"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Amount Details */}
                  <div className="receipt-section mb-4">
                    <h3 className="text-lg font-semibold mb-3">Amount Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Amount</div>
                        <div className="text-xl font-bold">
                          {selectedTransfer.currency} {Number(selectedTransfer.amount).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Fee</div>
                        <div className="font-medium">{selectedTransfer.currency} {selectedTransfer.fee || "0.00"}</div>
                      </div>
                    </div>
                    {selectedTransfer.remark && (
                      <div className="mt-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Remark</div>
                        <div className="font-medium">{selectedTransfer.remark}</div>
                      </div>
                    )}
                  </div>

                  {/* Additional Details */}
                  <div className="receipt-section mb-4">
                    <h3 className="text-lg font-semibold mb-3">Additional Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Created At</div>
                        <div className="font-medium">{format(new Date(selectedTransfer.created_at), "MMM d, yyyy h:mm a")}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Updated At</div>
                        <div className="font-medium">{format(new Date(selectedTransfer.updated_at), "MMM d, yyyy h:mm a")}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Wallet ID</div>
                        <div className="font-medium font-mono text-sm truncate" title={selectedTransfer.wallet_id}>{selectedTransfer.wallet_id}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Transaction ID</div>
                        <div className="font-medium font-mono text-sm truncate" title={selectedTransfer.id}>{selectedTransfer.id}</div>
                      </div>
                    </div>
                    {selectedTransfer.failure_reason && (
                      <div className="mt-3 p-3 bg-red-50 rounded-md border border-red-100">
                        <div className="text-xs text-red-700 uppercase tracking-wider">Failure Reason</div>
                        <div className="font-medium text-red-700">{selectedTransfer.failure_reason}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <DialogFooter className="flex gap-2">
                  <Button variant="outline" onClick={printReceipt}>
                    Print Receipt
                  </Button>
                  <Button onClick={() => setTransferDetailDialogOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Configuration Dialog */}
        <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Payroll Configuration</DialogTitle>
                    <DialogDescription>
                        Set the salary payment interval and other settings.
                    </DialogDescription>
                </DialogHeader>
                <Form {...configForm}>
                    <form onSubmit={configForm.handleSubmit(onUpdateConfig)} className="space-y-4">
                        <FormField
                            control={configForm.control}
                            name="salary_interval"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Salary Interval</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select interval" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="daily">Daily</SelectItem>
                                            <SelectItem value="weekly">Weekly</SelectItem>
                                            <SelectItem value="monthly">Monthly</SelectItem>
                                            <SelectItem value="yearly">Yearly</SelectItem>
                                            <SelectItem value="custom">Custom</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {watchInterval === 'custom' && (
                            <FormField
                                control={configForm.control}
                                name="salary_custom_date"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Custom Date</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant={"outline"}
                                                        className={cn(
                                                            "w-full pl-3 text-left font-normal",
                                                            !field.value && "text-muted-foreground"
                                                        )}
                                                    >
                                                        {field.value ? (
                                                            format(new Date(field.value), "PPP")
                                                        ) : (
                                                            <span>Pick a date</span>
                                                        )}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value ? new Date(field.value) : undefined}
                                                    onSelect={(date) => field.onChange(date?.toISOString())}
                                                    disabled={(date) =>
                                                        date < new Date("1900-01-01")
                                                    }
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <DialogFooter>
                            <Button type="submit">Save Changes</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>

        {/* Update Payroll Dialog */}
        <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
          <DialogContent className="w-[90vw] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Update Payroll Details</DialogTitle>
            </DialogHeader>
            <Form {...updateForm}>
              <form onSubmit={updateForm.handleSubmit(onUpdatePayroll)} className="space-y-4">
                 <FormField
                    control={updateForm.control}
                    name="salary"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Salary</FormLabel>
                            <FormControl><Input type="number" placeholder="100" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={updateForm.control}
                    name="salary_currency"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Currency</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="NGN">NGN</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={updateForm.control}
                    name="bank_code"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Bank</FormLabel>
                            <Popover open={openBank} onOpenChange={setOpenBank}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openBank}
                                            className={cn(
                                                "w-full justify-between",
                                                !field.value && "text-muted-foreground"
                                            )}
                                        >
                                            {field.value
                                                ? banks.find((bank) => bank.code === field.value)?.name
                                                : "Select Bank"}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" side="bottom" align="start">
                                    <Command className="h-auto">
                                        <CommandInput placeholder="Search bank..." />
                                        <CommandList className="max-h-[200px] overflow-y-auto">
                                            <CommandEmpty>No bank found.</CommandEmpty>
                                            <CommandGroup>
                                            {banks.map((bank) => (
                                                <CommandItem
                                                    value={bank.name}
                                                    key={bank.code}
                                                    onSelect={() => {
                                                        updateForm.setValue("bank_code", bank.code)
                                                        setOpenBank(false)
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            bank.code === field.value
                                                                ? "opacity-100"
                                                                : "opacity-0"
                                                        )}
                                                    />
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
                    control={updateForm.control}
                    name="bank_account_number"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Account Number</FormLabel>
                            <FormControl><Input {...field} maxLength={10} /></FormControl>
                            {accountName && <p className="text-sm text-muted-foreground mt-1">Verified: {accountName}</p>}
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={updateForm.control}
                    name="account_name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Account Name</FormLabel>
                            <FormControl><Input {...field} placeholder="Verified account name will appear here" readOnly className="bg-muted" /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={updateForm.control}
                    name="contract_start_date"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Contract Start Date</FormLabel>
                            <FormControl><Input type="date" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <DialogFooter>
                    <Button type="submit" disabled={isUpdating}>
                        {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Update
                    </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Adjustment Dialog */}
        <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Adjustment</DialogTitle>
            </DialogHeader>
            <Form {...adjustmentForm}>
              <form onSubmit={adjustmentForm.handleSubmit(onAddAdjustment)} className="space-y-4">
                 <FormField
                    control={adjustmentForm.control}
                    name="type"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="bonus">Bonus</SelectItem>
                                    <SelectItem value="deduction">Deduction</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={adjustmentForm.control}
                    name="amount"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Amount</FormLabel>
                            <FormControl><Input type="number" placeholder="100" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={adjustmentForm.control}
                    name="reason"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Reason</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <DialogFooter>
                    <Button type="submit">Add</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Bulk Transfer Dialog */}
        <Dialog open={bulkTransferDialogOpen} onOpenChange={(open) => {
            setBulkTransferDialogOpen(open);
            if (!open) {
                setBulkTransferStep("select");
                setOtpSent(false);
                setEpicTransferItems([]);
                setTransferSuccessData(null);
            }
        }}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Bulk Transfer</DialogTitle>
                    <DialogDescription>
                        Select transfer type and complete the process.
                    </DialogDescription>
                </DialogHeader>

                {bulkTransferStep === "select" ? (
                    <Form {...bulkTransferForm}>
                        <form onSubmit={bulkTransferForm.handleSubmit(onGoToReviewStep)} className="space-y-4">
                            <FormField
                                control={bulkTransferForm.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Transfer Type</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="salary">Salary Transfer</SelectItem>
                                                <SelectItem value="epic">Epic Transfer</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {bulkTransferForm.watch("type") === "epic" && (
                                <>
                                    <FormField
                                        control={bulkTransferForm.control}
                                        name="epic_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Select Epic</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Select epic" /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        {epics.map(epic => (
                                                            <SelectItem key={epic.id} value={epic.id}>{epic.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <div className="space-y-2">
                                        <Label>Transfer Mode</Label>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                variant={epicTransferMode === "single" ? "default" : "outline"}
                                                onClick={() => setEpicTransferMode("single")}
                                                className="flex-1"
                                            >
                                                Single
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={epicTransferMode === "bulk" ? "default" : "outline"}
                                                onClick={() => setEpicTransferMode("bulk")}
                                                className="flex-1"
                                            >
                                                Bulk
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}

                            <FormField
                                control={bulkTransferForm.control}
                                name="source_wallet_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Source Wallet</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {wallets?.business_wallet && (
                                                    <SelectItem value={wallets.business_wallet.id}>
                                                        Business Wallet ({wallets.business_wallet.currency} {Number(wallets.business_wallet.balance).toLocaleString()})
                                                    </SelectItem>
                                                )}
                                                {wallets?.user_wallet && (
                                                    <SelectItem value={wallets.user_wallet.id}>
                                                        Personal Wallet ({wallets.user_wallet.currency} {Number(wallets.user_wallet.balance).toLocaleString()})
                                                    </SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {bulkTransferForm.watch("type") === "salary" && (
                                <div className="bg-muted p-3 rounded-lg">
                                    <p className="text-sm font-medium mb-2">Preview</p>
                                    <p className="text-sm text-muted-foreground">
                                        {employees.length} employees will receive a total of {employees.reduce((acc, emp) => acc + Number(emp.net_salary), 0).toLocaleString()} NGN
                                    </p>
                                </div>
                            )}

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
                                            <RadioGroupItem value="" id="payroll-method-default" />
                                            <Label htmlFor="payroll-method-default">Default</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="email" id="payroll-method-email" />
                                            <Label htmlFor="payroll-method-email">Email</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="sms" id="payroll-method-sms" />
                                            <Label htmlFor="payroll-method-sms">SMS</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="whatsapp" id="payroll-method-whatsapp" />
                                            <Label htmlFor="payroll-method-whatsapp">WhatsApp</Label>
                                        </div>
                                    </RadioGroup>
                                </div>
                            )}

                            <DialogFooter>
                                <Button type="submit" disabled={otpLoading}>
                                    {otpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Continue
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                ) : bulkTransferStep === "review" ? (
                    <div className="space-y-4">
                        {bulkTransferForm.watch("type") === "salary" ? (
                            <div className="space-y-4">
                                <div className="bg-muted p-3 rounded-lg">
                                    <h3 className="font-semibold mb-2">Salary Transfer Preview</h3>
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                        {employees.map((employee) => (
                                            <div key={employee.id} className="flex justify-between items-center p-2 bg-background rounded border">
                                                <div>
                                                    <p className="font-medium">{employee.name}</p>
                                                    <p className="text-xs text-muted-foreground">{employee.email}</p>
                                                </div>
                                                <p className="font-semibold">
                                                    {employee.salary_currency} {Number(employee.net_salary).toLocaleString()}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between items-center p-2 border-t mt-2 pt-2">
                                        <p className="font-semibold">Total Amount</p>
                                        <p className="font-bold text-primary text-lg">
                                            {employees[0]?.salary_currency || "NGN"} {employees.reduce((acc, emp) => acc + Number(emp.net_salary), 0).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-semibold">Recipients</h3>
                                    <Button type="button" size="sm" onClick={addRecipient} disabled={epicTransferMode === "single" && epicTransferItems.length >= 1}>
                                        <Plus className="mr-1 h-4 w-4" /> Add Recipient
                                    </Button>
                                </div>
                                <div className="space-y-3 max-h-80 overflow-y-auto">
                                    {(() => {
                                        const values = bulkTransferForm.getValues();
                                        const selectedEpic = epics.find(e => e.id === values.epic_id);
                                        return epicTransferItems.map((item, index) => {
                                            const id = `recipient_${index}`;
                                            const status = recipientLookupStatus[index];
                                            return (
                                                <div key={id} className="bg-muted p-3 rounded-lg border space-y-3">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1 space-y-3">
                                                            <div className="flex flex-col">
                                                                <Label>Bank</Label>
                                                                <Popover open={openBankPopover === index} onOpenChange={(open) => setOpenBankPopover(open ? index : null)}>
                                                                    <PopoverTrigger asChild>
                                                                        <Button
                                                                            variant="outline"
                                                                            role="combobox"
                                                                            aria-expanded={openBankPopover === index}
                                                                            className="w-full justify-between"
                                                                        >
                                                                            {item.recipient_bank
                                                                                ? banks.find((bank) => bank.code === item.recipient_bank)?.name
                                                                                : "Select bank"}
                                                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                                        </Button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" side="bottom" align="start">
                                                                        <Command className="h-auto">
                                                                            <CommandInput placeholder="Search bank..." />
                                                                            <CommandList className="max-h-[200px] overflow-y-auto">
                                                                                <CommandEmpty>No bank found.</CommandEmpty>
                                                                                <CommandGroup>
                                                                                    {banks.map((bank) => (
                                                                                        <CommandItem
                                                                                            value={bank.name}
                                                                                            key={bank.code}
                                                                                            onSelect={() => {
                                                                                                updateRecipient(id, "recipient_bank", bank.code);
                                                                                                setOpenBankPopover(null);
                                                                                            }}
                                                                                        >
                                                                                            <Check
                                                                                                className={cn(
                                                                                                    "mr-2 h-4 w-4",
                                                                                                    bank.code === item.recipient_bank
                                                                                                        ? "opacity-100"
                                                                                                        : "opacity-0"
                                                                                                )}
                                                                                            />
                                                                                            {bank.name}
                                                                                        </CommandItem>
                                                                                    ))}
                                                                                </CommandGroup>
                                                                            </CommandList>
                                                                        </Command>
                                                                    </PopoverContent>
                                                                </Popover>
                                                            </div>
                                                            <div>
                                                                <Label>Account Number</Label>
                                                                <Input
                                                                    value={item.recipient_account}
                                                                    maxLength={10}
                                                                    onChange={(e) => updateRecipient(id, "recipient_account", e.target.value)}
                                                                />
                                                            </div>
                                                            
                                                            {status?.loading && (
                                                                <div className="text-sm text-muted-foreground flex items-center gap-1">
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                    Verifying account...
                                                                </div>
                                                            )}
                                                            
                                                            {status?.success && status.name && (
                                                                <div className="text-sm text-green-600 flex items-center gap-1">
                                                                    <Check className="h-4 w-4" />
                                                                    Verified: {status.name}
                                                                </div>
                                                            )}
                                                            
                                                            {status?.error && (
                                                                <div className="text-sm text-destructive flex items-center gap-1">
                                                                    <AlertCircle className="h-4 w-4" />
                                                                    {status.error}
                                                                </div>
                                                            )}
                                                            
                                                            <div>
                                                                <Label>Amount</Label>
                                                                <Input
                                                                    type="number"
                                                                    value={item.amount}
                                                                    onChange={(e) => updateRecipient(id, "amount", Number(e.target.value))}
                                                                />
                                                            </div>
                                                            <div>
                                                                <Label>Remark</Label>
                                                                <Input
                                                                    value={selectedEpic?.name || ""}
                                                                    readOnly
                                                                    className="bg-muted"
                                                                />
                                                            </div>
                                                        </div>
                                                        {epicTransferMode === "bulk" && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="ml-2"
                                                                onClick={() => removeRecipient(id)}
                                                            >
                                                                <Trash2 className="h-4 w-4 text-destructive" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                                {epicTransferItems.length === 0 && (
                                    <div className="text-center text-muted-foreground">
                                        No recipients added. Click "Add Recipient" to start.
                                    </div>
                                )}
                                {epicTransferItems.length > 0 && (
                                    <div className="bg-primary/10 p-3 rounded-lg border border-primary/20">
                                        <div className="flex justify-between items-center">
                                            <p className="font-semibold">Total Amount</p>
                                            <p className="font-bold text-primary text-lg">
                                                NGN {epicTransferItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setBulkTransferStep("select")}
                            >
                                Back
                            </Button>
                            <Button
                                type="button"
                                onClick={onRequestOtp}
                                disabled={
                                    (bulkTransferForm.watch("type") === "epic" && 
                                        (epicTransferItems.length === 0 || 
                                        epicTransferItems.some((_, index) => {
                                            const status = recipientLookupStatus[index];
                                            return status?.error || status?.loading || !status?.success;
                                        }) 
                                    )) 
                                    || otpLoading
                                }
                            >
                                {otpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Request OTP
                            </Button>
                        </DialogFooter>
                    </div>
                ) : bulkTransferStep === "otp" ? (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Enter OTP</Label>
                            <Input 
                                placeholder="123456" 
                                maxLength={6}
                                onChange={(e) => bulkTransferForm.setValue("otp", e.target.value)}
                            />
                        </div>

                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleResendOTP} 
                            disabled={isActive || otpLoading}
                            className="w-full"
                        >
                            {otpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {isActive ? `Resend OTP in ${seconds}s` : "Resend OTP"}
                        </Button>

                        <DialogFooter>
                            <Button 
                                variant="outline" 
                                onClick={() => {
                                    setBulkTransferStep("review");
                                    setOtpSent(false);
                                }}
                            >
                                Back
                            </Button>
                            <Button 
                                onClick={() => onFinalizeBulkTransfer(bulkTransferForm.getValues("otp") || "")}
                            >
                                Confirm Transfer
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    // Success screen
                    <div className="space-y-6">
                        <div className="text-center space-y-2">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                <Check className="w-8 h-8 text-green-600" />
                            </div>
                            <h3 className="text-xl font-bold">Transfer Successful!</h3>
                            <p className="text-muted-foreground">{transferSuccessData?.message}</p>
                        </div>

                        <div className="bg-muted p-4 rounded-lg space-y-3">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Queued Transfers:</span>
                                <span className="font-semibold">{transferSuccessData?.queued}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Type:</span>
                                <span className="font-semibold">{transferSuccessData?.type}</span>
                            </div>
                            <div className="border-t pt-3 space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Total Amount:</span>
                                    <span className="font-semibold">{transferSuccessData?.totals?.amount?.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Fee:</span>
                                    <span className="font-semibold">{transferSuccessData?.totals?.fee?.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-lg">
                                    <span className="font-medium">Total:</span>
                                    <span className="font-bold text-primary">{transferSuccessData?.totals?.total?.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {transferSuccessData?.transfers && transferSuccessData.transfers.length > 0 && (
                            <div className="max-h-[250px] overflow-y-auto">
                                <h4 className="text-sm font-medium mb-2">Transfers:</h4>
                                <div className="space-y-2">
                                    {transferSuccessData.transfers.map((transfer: any) => (
                                        <div key={transfer.id} className="p-3 bg-background border rounded-lg flex justify-between items-center">
                                            <div>
                                                <p className="font-medium">{transfer.recipient_name}</p>
                                                <p className="text-xs text-muted-foreground">{transfer.reference}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold">{transfer.currency} {Number(transfer.amount).toLocaleString()}</p>
                                                <Badge variant={transfer.status === "success" ? "default" : transfer.status === "failed" ? "destructive" : "secondary"}>
                                                    {transfer.status}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button onClick={() => {
                                setBulkTransferDialogOpen(false);
                                setBulkTransferStep("select");
                                setOtpSent(false);
                                setEpicTransferItems([]);
                                setTransferSuccessData(null);
                            }}>
                                Done
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

      </div>
    </Layout>
  );
}
