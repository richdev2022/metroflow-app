import React, { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { PayrollEmployee, Transfer, WalletInfo, PayrollAdjustment, PayrollConfig, Epic, TransferItem } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, DollarSign, Plus, Minus, Check, ChevronsUpDown, MoreHorizontal, Trash2, Search as SearchIcon, ChevronLeft, ChevronRight, Filter, Calendar as CalendarIcon, Settings, User, CreditCard, FileText, Users, ArrowRightLeft } from "lucide-react";
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
  
  // Bulk Transfer State
  const [epicTransferItems, setEpicTransferItems] = useState<TransferItem[]>([]);
  const [bulkTransferStep, setBulkTransferStep] = useState<"select" | "otp">("select");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const { seconds, isActive, startCountdown } = useCountdown();

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

      const res = await api.get<{success: boolean, data: PayrollEmployee[], pagination: any}>(`/payroll/summary?${queryParams.toString()}`);
      if (res.data.success) {
        setEmployees(res.data.data || []);
      } else {
        setEmployees([]);
      }
    } catch (error) {
      console.error("Failed to fetch employees", error);
      toast({
        title: "Error",
        description: "Failed to load employee data",
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
    } catch (error) {
      console.error("Failed to fetch transfers", error);
      toast({
        title: "Error",
        description: "Failed to load transfer history",
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
      } catch (error) {
          toast({ title: "Error", description: "Failed to update configuration", variant: "destructive" });
      }
  };

  const fetchData = async () => {
    try {
      fetchEmployees(1);
      fetchConfig();
      fetchEpics();

      const [walletRes, banksRes] = await Promise.all([
        api.get<WalletInfo>("/wallet"),
        api.get<{success: boolean, data: {code: string, name: string}[]}>("/transfers/banks")
      ]);
      
      setWallets(walletRes.data);
      if (banksRes.data.success) {
        setBanks(banksRes.data.data);
      }
    } catch (error) {
      console.error("Failed to fetch data", error);
      toast({
        title: "Error",
        description: "Failed to load data",
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
        setEmployeeAdjustments(res.data.data);
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
    } catch (e) {
      toast({ title: "Error", description: "Failed to delete adjustment", variant: "destructive" });
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
    } catch (error) {
      toast({ title: "Error", description: "Failed to update details", variant: "destructive" });
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
    } catch (error) {
      toast({ title: "Error", description: "Failed to add adjustment", variant: "destructive" });
    }
  };

  const handleResendOTP = async () => {
    try {
      setOtpLoading(true);
      const values = bulkTransferForm.getValues();
      await api.post("/transfers/otp/request", { wallet_id: values.source_wallet_id });
      toast({ title: "OTP Sent", description: "New OTP sent." });
      startCountdown();
    } catch (error) {
      toast({ title: "Error", description: "Failed to resend OTP", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const retryTransfer = async (id: string) => {
    setRetryingId(id);
    try {
      await api.post(`/transfers/${id}/retry`);
      toast({ title: "Success", description: "Transfer retry initiated" });
      fetchTransfers();
    } catch (error) {
      toast({ title: "Error", description: "Failed to retry transfer", variant: "destructive" });
    } finally {
      setRetryingId(null);
    }
  };

  const openBulkTransfer = () => {
    setBulkTransferStep("select");
    setOtpSent(false);
    setEpicTransferItems([]);
    bulkTransferForm.reset();
    setBulkTransferDialogOpen(true);
  };

  const onInitiateBulkTransfer = async (values: z.infer<typeof bulkTransferSchema>) => {
    try {
      setOtpLoading(true);
      await api.post("/transfers/otp/request", { wallet_id: values.source_wallet_id });
      setOtpSent(true);
      setBulkTransferStep("otp");
      startCountdown();
      toast({ title: "OTP Sent", description: "Please enter the OTP sent to your registered contact." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to send OTP", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const onFinalizeBulkTransfer = async (otp: string) => {
    if (!otp) {
      toast({ title: "Error", description: "Please enter OTP", variant: "destructive" });
      return;
    }
    try {
      const values = bulkTransferForm.getValues();
      let payload: any = {
        type: values.type,
        otp: otp,
        source_wallet_id: values.source_wallet_id,
      };

      if (values.type === "salary") {
        // For salary, we send all employees
        const items = employees.map(emp => ({
          recipient_account: emp.bank_account_number || emp.account_number || "",
          recipient_bank: emp.bank_code || "",
          recipient_name: emp.account_name || "",
          amount: emp.net_salary,
          remark: "Salary Payment",
          source_type: "salary",
        }));
        payload.items = items;
      } else if (values.type === "epic" && epicTransferItems.length > 0) {
        payload.items = epicTransferItems;
        payload.epic_id = values.epic_id;
      }

      await api.post("/transfers/bulk", payload);
      toast({ title: "Success", description: "Bulk transfer initiated" });
      setBulkTransferDialogOpen(false);
      setOtpSent(false);
      fetchData();
      fetchTransfers();
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.message || "Failed to initiate bulk transfer", variant: "destructive" });
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
                          <TableRow key={transfer.id}>
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
                            <TableCell>
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
                        {selectedEmployee.adjustments?.bonus_list && selectedEmployee.adjustments.bonus_list.length > 0 ? (
                            <div className="border rounded-md overflow-hidden">
                                <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Bonus Details</div>
                                <div className="divide-y">
                                    {selectedEmployee.adjustments.bonus_list.map((item, idx) => (
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
                        {selectedEmployee.adjustments?.deduction_list && selectedEmployee.adjustments.deduction_list.length > 0 ? (
                            <div className="border rounded-md overflow-hidden">
                                <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Deduction Details</div>
                                <div className="divide-y">
                                    {selectedEmployee.adjustments.deduction_list.map((item, idx) => (
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
                {employeeAdjustments.length > 0 && (
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
                            <FormControl><Input type="number" {...field} /></FormControl>
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
                            <FormControl><Input type="number" {...field} /></FormControl>
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
            }
        }}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Bulk Transfer</DialogTitle>
                    <DialogDescription>
                        Select transfer type and complete the process.
                    </DialogDescription>
                </DialogHeader>

                {bulkTransferStep === "select" ? (
                    <Form {...bulkTransferForm}>
                        <form onSubmit={bulkTransferForm.handleSubmit(onInitiateBulkTransfer)} className="space-y-4">
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
                                    <p className="text-sm font-medium mb-2">Summary</p>
                                    <p className="text-sm text-muted-foreground">
                                        {employees.length} employees will receive a total of {employees.reduce((acc, emp) => acc + Number(emp.net_salary), 0).toLocaleString()} NGN
                                    </p>
                                </div>
                            )}

                            <DialogFooter>
                                <Button type="submit" disabled={otpLoading}>
                                    {otpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                                    setBulkTransferStep("select");
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
                )}
            </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}
