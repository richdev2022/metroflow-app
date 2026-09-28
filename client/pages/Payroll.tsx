import React, { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import {
  PayrollDirectoryEmployee,
  PayrollDirectoryResponse,
  PayrollAdjustment,
  PayrollConfig,
  Epic,
  TransferItem,
  WalletInfo,
  OtpEnabledResponse,
  VerifyBulkResponse,
} from "@shared/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  Plus,
  Check,
  ChevronsUpDown,
  Trash2,
  Search as SearchIcon,
  ChevronLeft,
  ChevronRight,
  Settings,
  Users,
  ArrowRightLeft,
  AlertTriangle,
  Wallet,
  ShieldCheck,
  UserPlus,
  Upload,
  Pencil,
  RefreshCw,
} from "lucide-react";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCountdown } from "@/hooks/useCountdown";
import { extractAccountName } from "@/lib/account-lookup";
import ImportEmployeesDialog from "@/components/payroll/ImportEmployeesDialog";
import VerificationBadge from "@/components/payroll/VerificationBadge";
import EmployeeDetailDialog from "@/components/payroll/EmployeeDetailDialog";
import EmployeeFormDialog from "@/components/payroll/EmployeeFormDialog";

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const configSchema = z.object({
  salary_interval: z.enum(["daily", "weekly", "monthly", "yearly", "custom"]),
  salary_custom_date: z.string().optional().nullable(),
});

const adjustmentSchema = z.object({
  type: z.enum(["bonus", "deduction"]),
  amount: z.string().min(1, "Amount is required"),
  reason: z.string().min(3, "Reason is required"),
});

const epicBulkTransferSchema = z.object({
  source_wallet_id: z.string().min(1, "Source wallet is required"),
  epic_id: z.string().min(1, "Epic is required"),
});

type VerificationFilter = "all" | "verified" | "unverified" | "failed";
type CurrencyFilter = "all" | "NGN" | "USD";

interface PayrollStats {
  total: number;
  verified: number;
  pending: number;
  failed: number;
  ngnTotal: number;
  ngnCount: number;
  usdTotal: number;
  usdCount: number;
}

const EMPTY_STATS: PayrollStats = {
  total: 0,
  verified: 0,
  pending: 0,
  failed: 0,
  ngnTotal: 0,
  ngnCount: 0,
  usdTotal: 0,
  usdCount: 0,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function maskAccount(account?: string | null): string {
  if (!account) return "—";
  const trimmed = String(account).trim();
  return trimmed.length > 4 ? `••••${trimmed.slice(-4)}` : trimmed;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function Payroll() {
  const { toast } = useToast();

  /* ---------------- Tabs ---------------- */
  const [activeTab, setActiveTab] = useState<"employees" | "payout" | "adjustments">("employees");

  /* ---------------- Stats + full-directory fetch (payout + adjustment selects) ---------------- */
  const [stats, setStats] = useState<PayrollStats>(EMPTY_STATS);
  const [directory, setDirectory] = useState<PayrollDirectoryEmployee[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);

  /* ---------------- Employees tab (paginated directory) ---------------- */
  const [employees, setEmployees] = useState<PayrollDirectoryEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const PAGE_SIZE = 10;

  // row-level verification state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [verifyingRowId, setVerifyingRowId] = useState<string | null>(null);
  const [bulkVerifying, setBulkVerifying] = useState(false);

  /* ---------------- Detail + form dialogs ---------------- */
  const [detailEmployee, setDetailEmployee] = useState<PayrollDirectoryEmployee | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<PayrollDirectoryEmployee | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  /* ---------------- Salary payout ---------------- */
  const [payoutStep, setPayoutStep] = useState<"review" | "otp" | "success">("review");
  const [payoutWalletId, setPayoutWalletId] = useState("");
  const [payoutOtp, setPayoutOtp] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutOtpLoading, setPayoutOtpLoading] = useState(false);
  const [payoutResult, setPayoutResult] = useState<any>(null);

  /* ---------------- Adjustments tab ---------------- */
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(false);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [adjustmentUserId, setAdjustmentUserId] = useState("");

  /* ---------------- Shared: wallets / banks / security ---------------- */
  const [wallets, setWallets] = useState<WalletInfo | null>(null);
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [otpEnabled, setOtpEnabled] = useState(true);
  const [pinCreated, setPinCreated] = useState(false);
  const [pin, setPin] = useState("");
  const [otpMethod, setOtpMethod] = useState<string>("");
  const [showCreatePinModal, setShowCreatePinModal] = useState(false);
  const [showResetPinModal, setShowResetPinModal] = useState(false);
  const [resetPinOtp, setResetPinOtp] = useState("");
  const [newPin, setNewPin] = useState("");

  /* ---------------- Config dialog ---------------- */
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [payrollConfig, setPayrollConfig] = useState<PayrollConfig | null>(null);

  /* ---------------- Epic bulk transfer dialog ---------------- */
  const [epics, setEpics] = useState<Epic[]>([]);
  const [epicTransferDialogOpen, setEpicTransferDialogOpen] = useState(false);
  const [epicTransferStep, setEpicTransferStep] = useState<"select" | "review" | "otp" | "success">("select");
  const [epicTransferItems, setEpicTransferItems] = useState<TransferItem[]>([]);
  const [epicTransferMode, setEpicTransferMode] = useState<"single" | "bulk">("bulk");
  const [epicOtpLoading, setEpicOtpLoading] = useState(false);
  const [epicTransferSuccessData, setEpicTransferSuccessData] = useState<any>(null);
  const [epicOtp, setEpicOtp] = useState("");
  const [openBankPopover, setOpenBankPopover] = useState<number | null>(null);
  const [openBank, setOpenBank] = useState(false);
  const [recipientLookupStatus, setRecipientLookupStatus] = useState<Record<number, { loading: boolean; success: boolean; name: string; error?: string }>>({});
  const { seconds, isActive, startCountdown } = useCountdown();

  const configForm = useForm<z.infer<typeof configSchema>>({
    resolver: zodResolver(configSchema),
    defaultValues: { salary_interval: "monthly", salary_custom_date: null },
  });
  const watchInterval = configForm.watch("salary_interval");

  const adjustmentForm = useForm<z.infer<typeof adjustmentSchema>>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { type: "bonus", amount: "", reason: "" },
  });

  const epicTransferForm = useForm<z.infer<typeof epicBulkTransferSchema>>({
    resolver: zodResolver(epicBulkTransferSchema),
    defaultValues: { source_wallet_id: "", epic_id: "" },
  });

  /* ================================================================== */
  /* Data fetching                                                       */
  /* ================================================================== */

  /** Full directory (up to 1000 rows) for stat cards, payout review + adjustment selects */
  const fetchDirectory = useCallback(async (silent = false) => {
    if (!silent) setDirectoryLoading(true);
    try {
      const collected: PayrollDirectoryEmployee[] = [];
      let current = 1;
      let tp = 1;
      do {
        const res = await api.get<PayrollDirectoryResponse>(`/payroll/employees?page=${current}&limit=200`);
        if (!res.data?.success) break;
        collected.push(...(Array.isArray(res.data.data) ? res.data.data : []));
        tp = res.data.pagination?.totalPages || 1;
        current += 1;
      } while (current <= tp && current <= 5);

      setDirectory(collected);

      const s: PayrollStats = { ...EMPTY_STATS };
      for (const emp of collected) {
        s.total += 1;
        const status = (emp.verification_status || "unverified").toLowerCase();
        if (status === "verified") s.verified += 1;
        else if (status === "failed") s.failed += 1;
        else s.pending += 1;
        const salary = Number(emp.salary_amount);
        if (!isNaN(salary) && salary > 0) {
          if ((emp.salary_currency || "NGN").toUpperCase() === "USD") {
            s.usdTotal += salary;
            s.usdCount += 1;
          } else {
            s.ngnTotal += salary;
            s.ngnCount += 1;
          }
        }
      }
      setStats(s);
    } catch (error: any) {
      console.error("Failed to fetch employee directory", error);
      if (!silent) {
        toast({
          title: "Error",
          description: error.response?.data?.error || error.response?.data?.message || "Failed to load employees",
          variant: "destructive",
        });
      }
    } finally {
      setDirectoryLoading(false);
    }
  }, [toast]);

  /** Paginated, filtered directory for the Employees table */
  const fetchEmployees = useCallback(
    async (currentPage = page) => {
      setEmployeesLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchApplied.trim()) params.append("search", searchApplied.trim());
        if (verificationFilter !== "all") params.append("verification_status", verificationFilter);
        if (currencyFilter !== "all") params.append("currency", currencyFilter);
        params.append("page", String(currentPage));
        params.append("limit", String(PAGE_SIZE));

        const res = await api.get<PayrollDirectoryResponse>(`/payroll/employees?${params.toString()}`);
        if (res.data?.success) {
          setEmployees(Array.isArray(res.data.data) ? res.data.data : []);
          setTotalRecords(res.data.pagination?.total || 0);
          setTotalPages(Math.max(1, res.data.pagination?.totalPages || 1));
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
      } finally {
        setEmployeesLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchApplied, verificationFilter, currencyFilter, page]
  );

  const fetchAdjustments = useCallback(async () => {
    setAdjustmentsLoading(true);
    try {
      const res = await api.get<{ success: boolean; adjustments: PayrollAdjustment[] }>("/payroll/adjustments");
      if (res.data?.success) {
        setAdjustments(res.data.adjustments || []);
      }
    } catch (error: any) {
      console.error("Failed to fetch adjustments", error);
    } finally {
      setAdjustmentsLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get<{ success: boolean; data: PayrollConfig }>("/payroll/config");
      if (res.data.success) {
        setPayrollConfig(res.data.data);
        configForm.reset({
          salary_interval: res.data.data.salary_interval,
          salary_custom_date: res.data.data.salary_custom_date,
        });
      }
    } catch (error) {
      console.error("Failed to fetch config");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchEpics = useCallback(async () => {
    try {
      const res = await api.get<{ success: boolean; data: Epic[] }>("/epics");
      if (res.data.success) {
        setEpics(res.data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch epics");
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchDirectory(true);
    fetchEmployees(page);
    fetchAdjustments();
  }, [fetchDirectory, fetchEmployees, fetchAdjustments, page]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [walletRes, banksRes, otpEnabledRes] = await Promise.all([
          api.get<WalletInfo>("/wallet"),
          api.get<{ success: boolean; data: { code: string; name: string }[] }>("/transfers/banks"),
          api.get<OtpEnabledResponse>("/settings/otp-enabled"),
        ]);
        setWallets(walletRes.data);
        if (banksRes.data.success) setBanks(banksRes.data.data);
        if (otpEnabledRes.data.success) {
          setOtpEnabled(otpEnabledRes.data.otpEnabled);
          setPinCreated(otpEnabledRes.data.pinCreated);
        }
      } catch (error: any) {
        console.error("Failed to fetch payroll prerequisites", error);
      }
      fetchConfig();
      fetchEpics();
      fetchDirectory();
      fetchAdjustments();
    };
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch the employees table when page or filters change
  useEffect(() => {
    fetchEmployees(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchApplied, verificationFilter, currencyFilter]);

  /* ================================================================== */
  /* Verification actions                                                */
  /* ================================================================== */

  const afterVerifyRefresh = () => {
    fetchEmployees(page);
    fetchDirectory(true);
  };

  const verifyEmployee = async (employeeId: string) => {
    setVerifyingRowId(employeeId);
    try {
      const res = await api.post(`/payroll/employees/${employeeId}/verify`);
      if (res.data?.success) {
        toast({
          title: "Account verified",
          description: `Resolved name: ${res.data?.data?.account_name || "—"}`,
        });
      } else {
        toast({
          title: "Verification failed",
          description: res.data?.error || "Could not verify this account",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.response?.data?.error || error.response?.data?.message || "Could not verify this account",
        variant: "destructive",
      });
    } finally {
      setVerifyingRowId(null);
      afterVerifyRefresh();
    }
  };

  /** Verify a list of ids (or all pending when ids is omitted) with a result summary */
  const verifyBulk = async (employeeIds?: string[]) => {
    setBulkVerifying(true);
    try {
      const payload = employeeIds && employeeIds.length > 0 ? { employee_ids: employeeIds } : {};
      const res = await api.post<VerifyBulkResponse>("/payroll/employees/verify-bulk", payload);
      if (res.data?.success) {
        const { total, verified, failed, results } = res.data.data;
        const failedNames = (results || [])
          .filter((r) => !r.success)
          .slice(0, 3)
          .map((r) => r.name)
          .join(", ");
        toast({
          title: `Verification finished — ${verified}/${total} verified`,
          description: failed > 0 ? `Failed: ${failed}${failedNames ? ` (${failedNames}${failed > 3 ? "…" : ""})` : ""}` : "All accounts resolved successfully.",
          variant: failed > 0 ? "destructive" : "default",
        });
        setSelectedIds(new Set());
        afterVerifyRefresh();
      } else {
        const errData = res.data as any;
        toast({
          title: "Verification failed",
          description: errData?.error || "Could not run bulk verification",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.response?.data?.error || error.response?.data?.message || "Could not run bulk verification",
        variant: "destructive",
      });
    } finally {
      setBulkVerifying(false);
    }
  };

  const pendingSelectableIds = employees
    .filter((e) => (e.verification_status || "unverified") !== "verified" && e.bank_code && e.account_number)
    .map((e) => e.id);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(pendingSelectableIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const pendingCount = useMemo(
    () => directory.filter((e) => (e.verification_status || "unverified") !== "verified").length,
    [directory]
  );

  /* ================================================================== */
  /* Salary payout                                                       */
  /* ================================================================== */

  const payable = useMemo(
    () => directory.filter((e) => Number(e.salary_amount) > 0 && e.status === "active"),
    [directory]
  );

  const payoutReview = useMemo(() => {
    // Match backend queue criteria: only employees WITH bank_code + account_number
    // are considered; among those, only verified ones are queued.
    const withBank = payable.filter((e) => e.bank_code && e.account_number);
    const verified = withBank.filter((e) => (e.verification_status || "unverified") === "verified");
    const skipped = withBank.filter((e) => (e.verification_status || "unverified") !== "verified");
    // Salary-earning actives without full bank details are dropped silently by the backend — flag them in the UI instead.
    const missingBank = payable.filter((e) => !(e.bank_code && e.account_number));
    const ngn = verified.filter((e) => (e.salary_currency || "NGN").toUpperCase() !== "USD");
    const usd = verified.filter((e) => (e.salary_currency || "NGN").toUpperCase() === "USD");
    const ngnTotal = ngn.reduce((sum, e) => sum + Number(e.salary_amount), 0);
    const usdTotal = usd.reduce((sum, e) => sum + Number(e.salary_amount), 0);
    return { withBank, verified, skipped, missingBank, ngn, usd, ngnTotal, usdTotal };
  }, [payable]);

  const requestPayoutOtp = async () => {
    if (!pin || pin.length !== 4) {
      toast({ title: "Error", description: "Please enter your 4-digit transaction PIN", variant: "destructive" });
      return;
    }
    if (!payoutWalletId) {
      toast({ title: "Error", description: "Please select a source wallet", variant: "destructive" });
      return;
    }
    if (payoutReview.verified.length === 0) {
      toast({ title: "Nothing to pay", description: "No verified employees with a salary were found.", variant: "destructive" });
      return;
    }
    try {
      setPayoutOtpLoading(true);
      const requestData: any = { wallet_id: payoutWalletId };
      if (otpMethod) requestData.otp_method = otpMethod;
      await api.post("/transfers/otp/request", requestData);
      setPayoutStep("otp");
      startCountdown();
      toast({ title: "OTP Sent", description: "Enter the OTP to confirm the salary payout." });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to send OTP",
        variant: "destructive",
      });
    } finally {
      setPayoutOtpLoading(false);
    }
  };

  const runSalaryPayout = async () => {
    if (otpEnabled && (!payoutOtp || payoutOtp.length < 4)) {
      toast({ title: "Error", description: "Please enter a valid OTP", variant: "destructive" });
      return;
    }
    if (!pin || pin.length !== 4) {
      toast({ title: "Error", description: "Please enter your 4-digit transaction PIN", variant: "destructive" });
      return;
    }
    try {
      setPayoutLoading(true);
      const payload: any = {
        type: "Salary",
        pin,
        source_wallet_id: payoutWalletId,
      };
      if (otpEnabled) payload.otp = payoutOtp;

      const res = await api.post("/transfers/bulk", payload);
      if (res.data?.success) {
        setPayoutResult({ ...res.data.data, message: res.data.message });
        setPayoutStep("success");
        fetchDirectory(true);
        fetchAdjustments();
      } else {
        toast({
          title: "Payout failed",
          description: res.data?.error || res.data?.message || "Could not run the salary payout",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Payout failed",
        description: error.response?.data?.error || error.response?.data?.message || "Could not run the salary payout",
        variant: "destructive",
      });
    } finally {
      setPayoutLoading(false);
    }
  };

  const resetPayout = () => {
    setPayoutStep("review");
    setPayoutResult(null);
    setPayoutOtp("");
  };

  /** CTA from the unverified warning card -> Employees tab with the pending filter */
  const reviewPendingVerifications = () => {
    setActiveTab("employees");
    setVerificationFilter("unverified");
    setSearchDraft("");
    setSearchApplied("");
    setPage(1);
    setSelectedIds(new Set());
    resetPayout();
  };

  /* ================================================================== */
  /* Adjustments                                                         */
  /* ================================================================== */

  const onAddAdjustment = async (values: z.infer<typeof adjustmentSchema>) => {
    if (!adjustmentUserId) {
      toast({ title: "Error", description: "Please select an employee", variant: "destructive" });
      return;
    }
    try {
      const employee = directory.find((e) => e.id === adjustmentUserId);
      await api.post("/payroll/adjustments", {
        userId: adjustmentUserId,
        ...values,
        amount: Number(values.amount),
        currency: (employee?.salary_currency || "NGN").toUpperCase(),
      });
      toast({ title: "Success", description: "Adjustment added" });
      setAdjustmentDialogOpen(false);
      setAdjustmentUserId("");
      adjustmentForm.reset();
      fetchAdjustments();
      fetchDirectory(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to add adjustment",
        variant: "destructive",
      });
    }
  };

  const deleteAdjustment = async (id: string) => {
    try {
      await api.delete(`/payroll/adjustments/${id}`);
      toast({ title: "Success", description: "Adjustment deleted" });
      fetchAdjustments();
      fetchDirectory(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to delete adjustment",
        variant: "destructive",
      });
    }
  };

  /* ================================================================== */
  /* Config                                                              */
  /* ================================================================== */

  const onUpdateConfig = async (values: z.infer<typeof configSchema>) => {
    try {
      const res = await api.put("/payroll/config", values);
      if (res.data.success) {
        toast({ title: "Success", description: "Configuration updated" });
        setConfigDialogOpen(false);
        fetchConfig();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to update configuration",
        variant: "destructive",
      });
    }
  };

  /* ================================================================== */
  /* Epic / bulk one-off transfers                                       */
  /* ================================================================== */

  const openEpicTransfer = () => {
    setEpicTransferStep("select");
    setEpicTransferItems([]);
    setEpicTransferMode("bulk");
    setEpicOtp("");
    epicTransferForm.reset();
    setEpicTransferDialogOpen(true);
  };

  const onEpicGoToReview = async (values: z.infer<typeof epicBulkTransferSchema>) => {
    if (epicTransferMode === "single") {
      setEpicTransferItems([
        {
          recipient_account: "",
          recipient_bank: "",
          recipient_name: "",
          amount: 0,
          remark: epics.find((e) => e.id === values.epic_id)?.name || "",
          source_type: "epic",
          source_id: values.epic_id || "",
        },
      ]);
    } else {
      setEpicTransferItems([]);
    }
    setEpicTransferStep("review");
  };

  const onEpicRequestOtp = async () => {
    try {
      setEpicOtpLoading(true);
      const values = epicTransferForm.getValues();
      await api.post("/transfers/otp/request", { wallet_id: values.source_wallet_id });
      setEpicTransferStep("otp");
      startCountdown();
      toast({ title: "OTP Sent", description: "Please enter the OTP sent to your registered contact." });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to send OTP",
        variant: "destructive",
      });
    } finally {
      setEpicOtpLoading(false);
    }
  };

  const addRecipient = () => {
    const values = epicTransferForm.getValues();
    const selectedEpic = epics.find((e) => e.id === values.epic_id);
    setEpicTransferItems([
      ...epicTransferItems,
      {
        recipient_account: "",
        recipient_bank: "",
        recipient_name: "",
        amount: 0,
        remark: selectedEpic?.name || "",
        source_type: "epic",
        source_id: values.epic_id || "",
      },
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
    const index = epicTransferItems.findIndex((_, i) => `recipient_${i}` === id);
    if (!recipient || !recipient.recipient_bank || !recipient.recipient_account) {
      toast({ title: "Error", description: "Please select a bank and enter account number", variant: "destructive" });
      return;
    }
    try {
      setRecipientLookupStatus((prev) => ({
        ...prev,
        [index]: { loading: true, success: false, name: "" },
      }));
      const res = await api.post("/transfers/account-lookup", {
        bank_code: recipient.recipient_bank,
        account_number: recipient.recipient_account,
      });
      if (res.data.success) {
        const name = extractAccountName(res.data);
        updateRecipient(id, "recipient_name", name);
        setRecipientLookupStatus((prev) => ({
          ...prev,
          [index]: { loading: false, success: true, name },
        }));
        toast({ title: "Success", description: name ? `Verified: ${name}` : "Account verified successfully" });
      } else {
        setRecipientLookupStatus((prev) => ({
          ...prev,
          [index]: { loading: false, success: false, name: "", error: res.data?.error || "Lookup failed" },
        }));
      }
    } catch (error: any) {
      setRecipientLookupStatus((prev) => ({
        ...prev,
        [index]: { loading: false, success: false, name: "", error: error.response?.data?.error || error.response?.data?.message || "Failed to verify account" },
      }));
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to verify account",
        variant: "destructive",
      });
    }
  };

  // Auto-lookup recipient account names as rows are completed (bank + 10-digit
  // account). Rows already resolved or in-flight are skipped.
  useEffect(() => {
    const runLookups = async () => {
      for (let index = 0; index < epicTransferItems.length; index++) {
        const item = epicTransferItems[index];
        const currentStatus = recipientLookupStatus[index];
        if (item.recipient_bank && item.recipient_account && item.recipient_account.length === 10) {
          if (currentStatus?.success || currentStatus?.loading) continue;
          setRecipientLookupStatus((prev) => ({
            ...prev,
            [index]: { loading: true, success: false, name: "" },
          }));
          try {
            const res = await api.post("/transfers/account-lookup", {
              bank_code: item.recipient_bank,
              account_number: item.recipient_account,
            });
            const name = extractAccountName(res.data);
            setEpicTransferItems((items) =>
              items.map((it, i) => (i === index ? { ...it, recipient_name: name } : it))
            );
            setRecipientLookupStatus((prev) => ({
              ...prev,
              [index]: { loading: false, success: true, name },
            }));
          } catch (error: any) {
            setRecipientLookupStatus((prev) => ({
              ...prev,
              [index]: {
                loading: false,
                success: false,
                name: "",
                error: error.response?.data?.error || error.response?.data?.message || "Could not verify account name",
              },
            }));
          }
        } else if (currentStatus) {
          setRecipientLookupStatus((prev) => {
            const next = { ...prev };
            delete next[index];
            return next;
          });
        }
      }
    };
    if (epicTransferItems.length > 0 && epicTransferStep === "review") {
      runLookups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicTransferItems, epicTransferStep]);

  const onFinalizeEpicTransfer = async () => {
    if (otpEnabled && !epicOtp) {
      toast({ title: "Error", description: "Please enter OTP", variant: "destructive" });
      return;
    }
    if (!pin || pin.length !== 4) {
      toast({ title: "Error", description: "Please enter your 4-digit PIN", variant: "destructive" });
      return;
    }
    try {
      const values = epicTransferForm.getValues();
      const selectedEpic = epics.find((e) => e.id === values.epic_id);

      // Single recipient -> route through /transfers/single
      if (epicTransferMode === "single" && epicTransferItems.length === 1) {
        const item = epicTransferItems[0];
        const payload: any = {
          bankCode: item.recipient_bank,
          accountNumber: item.recipient_account,
          accountName: item.recipient_name,
          amount: item.amount,
          remark: selectedEpic?.name || "",
          pin: pin,
          wallet_id: values.source_wallet_id,
        };
        if (otpEnabled) payload.otp = epicOtp;

        const response = await api.post("/transfers/single", payload);
        if (response.data.success) {
          setEpicTransferSuccessData({
            queued: 1,
            type: "Single Epic",
            message: response.data.message,
            totals: {
              amount: item.amount,
              fee: response.data.data.fee || 0,
              total: (Number(item.amount) || 0) + (response.data.data.fee || 0),
            },
            transfers: [response.data.data],
          });
          setEpicTransferStep("success");
          fetchDirectory(true);
        }
        return;
      }

      const items = epicTransferItems.map((item) => ({
        bankCode: item.recipient_bank,
        accountNumber: item.recipient_account,
        accountName: item.recipient_name,
        amount: item.amount,
        remark: selectedEpic?.name || "",
      }));

      const payload: any = {
        type: "Epic",
        pin: pin,
        source_wallet_id: values.source_wallet_id,
        data: { items },
      };
      if (otpEnabled) payload.otp = epicOtp;

      const response = await api.post("/transfers/bulk", payload);
      if (response.data.success) {
        setEpicTransferSuccessData({
          ...response.data.data,
          message: response.data.message,
        });
        setEpicTransferStep("success");
        fetchDirectory(true);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to initiate transfer",
        variant: "destructive",
      });
    }
  };

  /* ================================================================== */
  /* PIN management                                                      */
  /* ================================================================== */

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
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to create PIN",
        variant: "destructive",
      });
    }
  };

  const handleSendResetPinOtp = async () => {
    try {
      await api.post("/settings/pin/send-otp");
      toast({ title: "OTP Sent", description: "OTP sent to reset PIN" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to send OTP",
        variant: "destructive",
      });
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
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to reset PIN",
        variant: "destructive",
      });
    }
  };

  /* ================================================================== */
  /* Derived UI helpers                                                  */
  /* ================================================================== */

  const verificationChips: { value: VerificationFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "verified", label: "Verified" },
    { value: "unverified", label: "Pending" },
    { value: "failed", label: "Failed" },
  ];

  const allPendingOnPageSelected =
    pendingSelectableIds.length > 0 && pendingSelectableIds.every((id) => selectedIds.has(id));

  const pinFields = (
    <div className="space-y-2">
      <Label>Transaction PIN</Label>
      <Input
        type="password"
        placeholder="Enter your PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
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
  );

  const otpMethodFields = (idPrefix: string) =>
    otpEnabled ? (
      <div className="space-y-2">
        <Label>OTP Method (Optional)</Label>
        <RadioGroup value={otpMethod} onValueChange={setOtpMethod} className="flex flex-col gap-2">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="" id={`${idPrefix}-method-default`} />
            <Label htmlFor={`${idPrefix}-method-default`}>Default</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="email" id={`${idPrefix}-method-email`} />
            <Label htmlFor={`${idPrefix}-method-email`}>Email</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="sms" id={`${idPrefix}-method-sms`} />
            <Label htmlFor={`${idPrefix}-method-sms`}>SMS</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="whatsapp" id={`${idPrefix}-method-whatsapp`} />
            <Label htmlFor={`${idPrefix}-method-whatsapp`}>WhatsApp</Label>
          </div>
        </RadioGroup>
      </div>
    ) : null;

  /* ================================================================== */
  /* Render                                                              */
  /* ================================================================== */

  return (
    <Layout>
      <div className="p-4 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Payroll</h2>
            <p className="text-muted-foreground">Employees, salary payouts and adjustments in one place.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Import
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingEmployee(null);
                setFormOpen(true);
              }}
            >
              <UserPlus className="mr-2 h-4 w-4" /> Add employee
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfigDialogOpen(true)}>
              <Settings className="mr-2 h-4 w-4" /> Configuration
            </Button>
            <Button variant="outline" size="sm" onClick={openEpicTransfer}>
              <ArrowRightLeft className="mr-2 h-4 w-4" /> Epic transfer
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <Card className="rounded-xl shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total employees</p>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              {directoryLoading ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <p className="mt-1.5 text-2xl font-bold tabular-nums">{stats.total}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.verified} verified · {stats.pending} pending
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Monthly payroll · NGN</p>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </div>
              {directoryLoading ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : (
                <p className="mt-1.5 text-xl sm:text-2xl font-bold tabular-nums">₦{formatMoney(stats.ngnTotal)}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{stats.ngnCount} employee{stats.ngnCount === 1 ? "" : "s"}</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Monthly payroll · USD</p>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </div>
              {directoryLoading ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : (
                <p className="mt-1.5 text-xl sm:text-2xl font-bold tabular-nums">${formatMoney(stats.usdTotal)}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{stats.usdCount} employee{stats.usdCount === 1 ? "" : "s"}</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Verification</p>
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              </div>
              {directoryLoading ? (
                <Skeleton className="mt-2 h-8 w-20" />
              ) : (
                <div className="mt-1.5 flex items-baseline gap-3">
                  <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{stats.verified}</span>
                  <span className="text-xs font-medium text-muted-foreground">vs</span>
                  <span className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{stats.pending + stats.failed}</span>
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="text-emerald-600 dark:text-emerald-400">verified</span> vs{" "}
                <span className="text-amber-600 dark:text-amber-400">pending/failed</span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
          <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="employees" className="gap-1.5">
              <Users className="h-4 w-4" />
              Employees
            </TabsTrigger>
            <TabsTrigger value="payout" className="gap-1.5">
              <Wallet className="h-4 w-4" />
              Salary Payout
            </TabsTrigger>
            <TabsTrigger value="adjustments" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Adjustments
            </TabsTrigger>
          </TabsList>

          {/* ------------------------------ Employees tab ------------------------------ */}
          <TabsContent value="employees" className="mt-4 space-y-4">
            {/* Filter bar */}
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm lg:flex-row lg:flex-wrap lg:items-center">
              <div className="relative w-full lg:w-64">
                <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search name, email or account"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setPage(1);
                      setSearchApplied(searchDraft);
                    }
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {verificationChips.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => {
                      setPage(1);
                      setVerificationFilter(chip.value);
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      verificationFilter === chip.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    )}
                    aria-pressed={verificationFilter === chip.value}
                  >
                    {chip.label}
                    {chip.value === "verified" && stats.verified > 0 && (
                      <span className="ml-1 opacity-70">{stats.verified}</span>
                    )}
                    {chip.value === "unverified" && stats.pending + stats.failed > 0 && (
                      <span className="ml-1 opacity-70">{stats.pending + stats.failed}</span>
                    )}
                  </button>
                ))}
              </div>

              <Select
                value={currencyFilter}
                onValueChange={(v) => {
                  setPage(1);
                  setCurrencyFilter(v as CurrencyFilter);
                }}
              >
                <SelectTrigger className="w-full sm:w-[130px]" aria-label="Filter by currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All currencies</SelectItem>
                  <SelectItem value="NGN">NGN</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 lg:ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => verifyBulk()}
                  disabled={bulkVerifying || pendingCount === 0 || stats.verified === stats.total}
                >
                  {bulkVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  Verify all pending{pendingCount > 0 ? ` (${pendingCount})` : ""}
                </Button>
              </div>
            </div>

            {/* Bulk selection bar */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="text-sm font-medium">
                  {selectedIds.size} employee{selectedIds.size === 1 ? "" : "s"} selected
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => verifyBulk(Array.from(selectedIds))}
                    disabled={bulkVerifying}
                  >
                    {bulkVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Verify selected
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
            )}

            {/* Directory table */}
            <Card className="rounded-xl shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 pl-4">
                          <Checkbox
                            checked={allPendingOnPageSelected}
                            onCheckedChange={(v) => toggleSelectAll(v === true)}
                            aria-label="Select all pending employees on this page"
                          />
                        </TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Job / Department</TableHead>
                        <TableHead>Salary</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead>Verification</TableHead>
                        <TableHead className="text-right pr-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeesLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={`skeleton-${i}`}>
                            {Array.from({ length: 7 }).map((_, j) => (
                              <TableCell key={j}>
                                <Skeleton className="h-4 w-full" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : employees.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-40">
                            <div className="flex flex-col items-center justify-center gap-2 text-center">
                              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                                <Users className="h-5 w-5 text-muted-foreground" />
                              </div>
                              <p className="text-sm font-medium">No employees found</p>
                              <p className="max-w-xs text-xs text-muted-foreground">
                                {searchApplied || verificationFilter !== "all" || currencyFilter !== "all"
                                  ? "Try adjusting or clearing the filters."
                                  : "Add your first employee or import a spreadsheet to get started."}
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        employees.map((emp) => {
                          const isVerified = (emp.verification_status || "unverified") === "verified";
                          const canVerify = !isVerified && !!emp.bank_code && !!emp.account_number;
                          const isUsd = (emp.salary_currency || "NGN").toUpperCase() === "USD";
                          return (
                            <TableRow
                              key={emp.id}
                              className="cursor-pointer hover:bg-muted/40"
                              onClick={() => {
                                setDetailEmployee(emp);
                                setDetailOpen(true);
                              }}
                            >
                              <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                                {canVerify && (
                                  <Checkbox
                                    checked={selectedIds.has(emp.id)}
                                    onCheckedChange={(v) => toggleSelect(emp.id, v === true)}
                                    aria-label={`Select ${emp.name} for verification`}
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2.5">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                    {initials(emp.name)}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium">{emp.name}</p>
                                    <p className="truncate text-xs text-muted-foreground">{emp.email}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm">{emp.job_title || "—"}</p>
                                <p className="text-xs text-muted-foreground">{emp.department || "—"}</p>
                              </TableCell>
                              <TableCell>
                                {emp.salary_amount ? (
                                  <Badge variant="secondary" className="bg-primary/10 font-semibold text-primary hover:bg-primary/10">
                                    {emp.salary_currency || "NGN"} {Number(emp.salary_amount).toLocaleString()}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {isUsd ? (
                                  <>
                                    <p className="text-sm">{emp.bank_name || "—"}</p>
                                    <p className="font-mono text-xs text-muted-foreground">{maskAccount(emp.account_number)}</p>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-sm">{emp.bank_name || emp.bank_code || "—"}</p>
                                    <p className="font-mono text-xs text-muted-foreground">{maskAccount(emp.account_number)}</p>
                                  </>
                                )}
                              </TableCell>
                              <TableCell>
                                <VerificationBadge
                                  status={emp.verification_status}
                                  verifiedAccountName={emp.verified_account_name}
                                  error={emp.verification_error}
                                />
                              </TableCell>
                              <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  {canVerify && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => verifyEmployee(emp.id)}
                                      disabled={verifyingRowId === emp.id || bulkVerifying}
                                    >
                                      {verifyingRowId === emp.id ? (
                                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                                      )}
                                      Verify
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label={`Edit ${emp.name}`}
                                    onClick={() => {
                                      setEditingEmployee(emp);
                                      setFormOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Page {page} of {totalPages} · {totalRecords} employee{totalRecords === 1 ? "" : "s"}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || employeesLoading}>
                      <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages || employeesLoading}
                    >
                      Next <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------ Salary Payout tab ------------------------------ */}
          <TabsContent value="payout" className="mt-4 space-y-4">
            <Card className="rounded-xl shadow-sm">
              <CardHeader>
                <CardTitle>Salary Payout</CardTitle>
                <CardDescription>
                  Pay all active, verified employees in one run. Employees with unverified accounts are skipped and listed after the run.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {directoryLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : payoutStep === "review" ? (
                  <div className="space-y-5">
                    {/* Confirmation screen: per-currency totals */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border bg-muted/30 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nigeria (NGN)</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums">₦{formatMoney(payoutReview.ngnTotal)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {payoutReview.ngn.length} verified employee{payoutReview.ngn.length === 1 ? "" : "s"} will be paid
                        </p>
                      </div>
                      <div className="rounded-xl border bg-muted/30 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">International (USD)</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums">${formatMoney(payoutReview.usdTotal)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {payoutReview.usd.length} verified employee{payoutReview.usd.length === 1 ? "" : "s"} will be paid
                        </p>
                      </div>
                    </div>

                    {payoutReview.verified.length === 0 ? (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
                        No verified employees with a salary were found. Verify recipient accounts in the{" "}
                        <button type="button" className="font-semibold underline" onClick={reviewPendingVerifications}>
                          Employees tab
                        </button>{" "}
                        first.
                      </div>
                    ) : (
                      <>
                        {payoutReview.skipped.length > 0 && (
                          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-950/30">
                            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
                              <AlertTriangle className="h-4 w-4" />
                              {payoutReview.skipped.length} employee{payoutReview.skipped.length === 1 ? "" : "s"} will be skipped (not verified)
                            </p>
                            <ul className="mt-2 space-y-1">
                              {payoutReview.skipped.slice(0, 5).map((e) => (
                                <li key={e.id} className="flex items-center justify-between gap-2 text-sm text-amber-900/90 dark:text-amber-200/90">
                                  <span className="truncate">{e.name}</span>
                                  <VerificationBadge status={e.verification_status} className="scale-90" />
                                </li>
                              ))}
                              {payoutReview.skipped.length > 5 && (
                                <li className="text-xs text-amber-800/80 dark:text-amber-300/80">
                                  and {payoutReview.skipped.length - 5} more…
                                </li>
                              )}
                            </ul>
                            <Button size="sm" variant="outline" className="mt-3" onClick={reviewPendingVerifications}>
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Review pending verifications
                            </Button>
                          </div>
                        )}

                        {payoutReview.missingBank.length > 0 && (
                          <div className="rounded-xl border bg-muted/30 p-4">
                            <p className="text-sm font-medium">
                              {payoutReview.missingBank.length} employee
                              {payoutReview.missingBank.length === 1 ? "" : "s"} with a salary have incomplete bank details
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              They will not be queued for this payout — open their profile in the Employees tab to complete the recipient details
                              {payoutReview.missingBank.some((e) => (e.salary_currency || "NGN").toUpperCase() === "USD")
                                ? " (USD recipients need bank name / SWIFT / routing details)."
                                : "."}
                            </p>
                          </div>
                        )}

                        {/* Wallet + PIN + OTP */}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="grid gap-1.5">
                            <Label>Source wallet</Label>
                            <Select value={payoutWalletId} onValueChange={setPayoutWalletId}>
                              <SelectTrigger aria-label="Source wallet">
                                <SelectValue placeholder="Select wallet" />
                              </SelectTrigger>
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
                          </div>
                          {pinFields}
                        </div>
                        {otpMethodFields("payout")}

                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                          <Button
                            size="lg"
                            onClick={requestPayoutOtp}
                            disabled={payoutOtpLoading || payoutReview.verified.length === 0}
                          >
                            {payoutOtpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {otpEnabled ? "Review & send OTP" : "Review & run payout"}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ) : payoutStep === "otp" ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border bg-muted/30 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">NGN total</p>
                        <p className="mt-1 text-xl font-bold tabular-nums">₦{formatMoney(payoutReview.ngnTotal)}</p>
                      </div>
                      <div className="rounded-xl border bg-muted/30 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">USD total</p>
                        <p className="mt-1 text-xl font-bold tabular-nums">${formatMoney(payoutReview.usdTotal)}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Enter OTP</Label>
                      <Input
                        placeholder="123456"
                        value={payoutOtp}
                        onChange={(e) => setPayoutOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        maxLength={6}
                      />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                      <Button variant="ghost" size="sm" onClick={() => setPayoutStep("review")} disabled={payoutLoading}>
                        Back
                      </Button>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        {isActive && <span className="text-xs text-muted-foreground">Resend OTP in {seconds}s</span>}
                        <Button variant="outline" size="sm" onClick={requestPayoutOtp} disabled={isActive || payoutOtpLoading}>
                          Resend OTP
                        </Button>
                        <Button onClick={runSalaryPayout} loading={payoutLoading}>
                          Confirm payout
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Success step */
                  <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-950/30">
                      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                        {payoutResult?.message || "Salary payout queued"}
                      </p>
                      {payoutResult?.totals && (
                        <p className="mt-1 text-sm text-emerald-700/90 dark:text-emerald-400/90">
                          Amount ₦{formatMoney(Number(payoutResult.totals.amount) || 0)} · Fee ₦
                          {formatMoney(Number(payoutResult.totals.fee) || 0)} · Total ₦
                          {formatMoney(Number(payoutResult.totals.total) || 0)}
                        </p>
                      )}
                      {payoutResult?.summary && (
                        <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
                          {Object.entries(payoutResult.summary)
                            .map(([k, v]) => `${v} ${k}`)
                            .join(" · ")}
                        </p>
                      )}
                    </div>

                    {/* Unverified employees warning card */}
                    {Array.isArray(payoutResult?.unverified_employees) && payoutResult.unverified_employees.length > 0 && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-950/30">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
                          <AlertTriangle className="h-4 w-4" />
                          {payoutResult.unverified_employees.length} employee
                          {payoutResult.unverified_employees.length === 1 ? "" : "s"} skipped — account not verified
                        </p>
                        <ul className="mt-2 space-y-1">
                          {payoutResult.unverified_employees.slice(0, 5).map((e: any) => (
                            <li key={e.id} className="flex items-center justify-between gap-2 text-sm text-amber-900/90 dark:text-amber-200/90">
                              <span className="truncate">{e.name}</span>
                              <VerificationBadge status={e.verification_status} className="scale-90" />
                            </li>
                          ))}
                          {payoutResult.unverified_employees.length > 5 && (
                            <li className="text-xs text-amber-800/80 dark:text-amber-300/80">
                              and {payoutResult.unverified_employees.length - 5} more…
                            </li>
                          )}
                        </ul>
                        <Button size="sm" variant="outline" className="mt-3" onClick={reviewPendingVerifications}>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Review pending verifications
                        </Button>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button variant="outline" onClick={resetPayout}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Run another payout
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------ Adjustments tab ------------------------------ */}
          <TabsContent value="adjustments" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Pending bonuses and deductions applied automatically on the next salary payout.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  adjustmentForm.reset();
                  setAdjustmentUserId("");
                  setAdjustmentDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Add adjustment
              </Button>
            </div>

            <Card className="rounded-xl shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Employee</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right pr-4"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustmentsLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={`adj-skeleton-${i}`}>
                            {Array.from({ length: 6 }).map((_, j) => (
                              <TableCell key={j}>
                                <Skeleton className="h-4 w-full" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : adjustments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                            No pending adjustments. Bonuses and deductions you add will appear here until the next payout.
                          </TableCell>
                        </TableRow>
                      ) : (
                        adjustments.map((adj) => (
                          <TableRow key={adj.id} className="hover:bg-muted/40">
                            <TableCell className="pl-4">
                              <p className="font-medium">{adj.user_name || "—"}</p>
                              <p className="text-xs text-muted-foreground">{adj.user_email}</p>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "font-medium",
                                  adj.type === "bonus"
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                    : "bg-red-500/10 text-red-700 dark:text-red-400"
                                )}
                              >
                                {adj.type === "bonus" ? "+" : "−"} {adj.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold tabular-nums">
                              {adj.currency} {Number(adj.amount).toLocaleString()}
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate" title={adj.reason}>
                              {adj.reason}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {adj.created_at ? new Date(adj.created_at).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell className="text-right pr-4">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Delete adjustment"
                                onClick={() => deleteAdjustment(adj.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ------------------------------ Employee detail dialog ------------------------------ */}
      <EmployeeDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        employee={detailEmployee}
        onEdit={(emp) => {
          setEditingEmployee(emp);
          setFormOpen(true);
        }}
        onVerified={afterVerifyRefresh}
      />

      {/* ------------------------------ Add / Edit employee dialog ------------------------------ */}
      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        employee={editingEmployee}
        onSaved={refreshAll}
      />

      {/* ------------------------------ Import employees dialog ------------------------------ */}
      <ImportEmployeesDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImported={refreshAll} />

      {/* ------------------------------ Configuration dialog ------------------------------ */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Payroll Configuration</DialogTitle>
            <DialogDescription>Set the salary payment interval and other settings.</DialogDescription>
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
              {watchInterval === "custom" && (
                <FormField
                  control={configForm.control}
                  name="salary_custom_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Pay Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {payrollConfig?.salary_custom_date && watchInterval !== "custom" && (
                <p className="text-sm text-muted-foreground">Custom pay date is only used when the interval is set to Custom.</p>
              )}
              <DialogFooter>
                <Button type="submit">Update</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ------------------------------ Add adjustment dialog ------------------------------ */}
      <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Adjustment</DialogTitle>
            <DialogDescription>
              Bonuses and deductions are applied to the employee's next salary payout automatically.
            </DialogDescription>
          </DialogHeader>
          <Form {...adjustmentForm}>
            <form onSubmit={adjustmentForm.handleSubmit(onAddAdjustment)} className="space-y-4">
              <div className="grid gap-1.5">
                <Label>Employee</Label>
                <Select value={adjustmentUserId} onValueChange={setAdjustmentUserId}>
                  <SelectTrigger aria-label="Select employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {directory.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name} {emp.salary_currency ? `(${emp.salary_currency})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FormField
                control={adjustmentForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
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
                    <FormControl>
                      <Input type="number" placeholder="100" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
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

      {/* ------------------------------ Epic / bulk one-off transfer dialog ------------------------------ */}
      <Dialog
        open={epicTransferDialogOpen}
        onOpenChange={(open) => {
          setEpicTransferDialogOpen(open);
          if (!open) {
            setEpicTransferStep("select");
            setEpicTransferItems([]);
            setEpicTransferSuccessData(null);
            setEpicOtp("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Epic Transfer</DialogTitle>
            <DialogDescription>Send one-off payments to recipients from an epic.</DialogDescription>
          </DialogHeader>

          {epicTransferStep === "select" ? (
            <Form {...epicTransferForm}>
              <form onSubmit={epicTransferForm.handleSubmit(onEpicGoToReview)} className="space-y-4">
                <FormField
                  control={epicTransferForm.control}
                  name="epic_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Epic</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select epic" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {epics.map((epic) => (
                            <SelectItem key={epic.id} value={epic.id}>
                              {epic.name}
                            </SelectItem>
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

                <FormField
                  control={epicTransferForm.control}
                  name="source_wallet_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source Wallet</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select wallet" />
                          </SelectTrigger>
                        </FormControl>
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

                {pinFields}
                {otpMethodFields("epic")}

                <DialogFooter>
                  <Button type="submit" disabled={epicOtpLoading}>
                    {epicOtpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continue
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          ) : epicTransferStep === "review" ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Recipients</h3>
                <Button
                  type="button"
                  size="sm"
                  onClick={addRecipient}
                  disabled={epicTransferMode === "single" && epicTransferItems.length >= 1}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add Recipient
                </Button>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {(() => {
                  const values = epicTransferForm.getValues();
                  const selectedEpic = epics.find((e) => e.id === values.epic_id);
                  return epicTransferItems.map((item, index) => {
                    const id = `recipient_${index}`;
                    const status = recipientLookupStatus[index];
                    return (
                      <div key={id} className="bg-muted p-3 rounded-lg border space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 space-y-3">
                            <div className="flex flex-col">
                              <Label>Bank</Label>
                              <Popover
                                open={openBankPopover === index}
                                onOpenChange={(open) => setOpenBankPopover(open ? index : null)}
                              >
                                <PopoverTrigger asChild>
                                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                                    {item.recipient_bank
                                      ? banks.find((b) => b.code === item.recipient_bank)?.name || item.recipient_bank
                                      : "Select bank"}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-0">
                                  <Command>
                                    <CommandInput placeholder="Search bank..." />
                                    <CommandList className="max-h-[200px] overflow-y-auto">
                                      <CommandEmpty>No bank found.</CommandEmpty>
                                      <CommandGroup>
                                        {banks.map((bank) => (
                                          <CommandItem
                                            key={bank.code}
                                            value={bank.name}
                                            onSelect={() => {
                                              updateRecipient(id, "recipient_bank", bank.code);
                                              setOpenBankPopover(null);
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
                            </div>
                            <div className="flex flex-col">
                              <Label>Account Number</Label>
                              <Input
                                value={item.recipient_account}
                                onChange={(e) => updateRecipient(id, "recipient_account", e.target.value.replace(/\D/g, ""))}
                                maxLength={10}
                                placeholder="10-digit account number"
                              />
                            </div>
                            <div className="flex flex-col">
                              <Label>Amount</Label>
                              <Input
                                type="number"
                                value={item.amount || ""}
                                onChange={(e) => updateRecipient(id, "amount", Number(e.target.value))}
                                placeholder="0"
                              />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => removeRecipient(id)}
                            aria-label="Remove recipient"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>

                        {status?.loading && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> Verifying account…
                          </p>
                        )}
                        {!status?.loading && status?.success && status.name && (
                          <p className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5" /> Account name: {status.name}
                          </p>
                        )}
                        {!status?.loading && status?.error && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-destructive">{status.error}</p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => verifyRecipientAccount(id)}
                              disabled={!item.recipient_bank || !item.recipient_account}
                            >
                              Retry
                            </Button>
                          </div>
                        )}
                        {!status && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => verifyRecipientAccount(id)}
                            disabled={!item.recipient_bank || !item.recipient_account}
                          >
                            Verify account
                          </Button>
                        )}
                        <p className="text-xs text-muted-foreground">Remark: {selectedEpic?.name || "—"}</p>
                      </div>
                    );
                  });
                })()}
                {epicTransferItems.length === 0 && (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No recipients yet. Click "Add Recipient" to start.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                <p className="font-semibold">Total</p>
                <p className="font-bold text-primary text-lg">
                  NGN {epicTransferItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0).toLocaleString()}
                </p>
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setEpicTransferStep("select")}>
                  Back
                </Button>
                <Button
                  onClick={onEpicRequestOtp}
                  disabled={
                    epicOtpLoading ||
                    epicTransferItems.length === 0 ||
                    epicTransferItems.some((_, index) => {
                      const item = epicTransferItems[index];
                      const st = recipientLookupStatus[index];
                      return !item.recipient_bank || !item.recipient_account || !item.amount || item.amount <= 0 || (st && !st.success && !!st.error);
                    })
                  }
                >
                  {epicOtpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {otpEnabled ? "Send OTP" : "Continue"}
                </Button>
              </div>
            </div>
          ) : epicTransferStep === "otp" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Enter OTP</Label>
                <Input
                  placeholder="123456"
                  value={epicOtp}
                  onChange={(e) => setEpicOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={onEpicRequestOtp} disabled={isActive || epicOtpLoading} className="w-full">
                {isActive ? `Resend OTP in ${seconds}s` : "Resend OTP"}
              </Button>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEpicTransferStep("review")}>
                  Back
                </Button>
                <Button onClick={onFinalizeEpicTransfer} loading={epicOtpLoading}>
                  Confirm Transfer
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-950/30">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  {epicTransferSuccessData?.message || "Transfer completed"}
                </p>
                {epicTransferSuccessData?.totals && (
                  <p className="mt-1 text-sm text-emerald-700/90 dark:text-emerald-400/90">
                    Amount {Number(epicTransferSuccessData.totals.amount).toLocaleString()} · Fee{" "}
                    {Number(epicTransferSuccessData.totals.fee).toLocaleString()} · Total{" "}
                    {Number(epicTransferSuccessData.totals.total).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setEpicTransferDialogOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------ Create PIN modal ------------------------------ */}
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
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
              />
            </div>
            <DialogFooter>
              <Button onClick={handleCreatePin}>Create PIN</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ------------------------------ Reset PIN modal ------------------------------ */}
      <Dialog open={showResetPinModal} onOpenChange={setShowResetPinModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Transaction PIN</DialogTitle>
            <DialogDescription>Verify with an OTP, then set a new PIN.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>OTP</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="123456"
                  value={resetPinOtp}
                  onChange={(e) => setResetPinOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                />
                <Button variant="outline" onClick={handleSendResetPinOtp}>
                  Send OTP
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>New PIN</Label>
              <Input
                type="password"
                placeholder="Enter 4-digit PIN"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
              />
            </div>
            <DialogFooter>
              <Button onClick={handleResetPin}>Reset PIN</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
