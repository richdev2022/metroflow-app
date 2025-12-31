import React, { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { PayrollEmployee, PayrollUpdateInput, PayrollAdjustmentInput, BulkTransferInput, Transfer, WalletInfo, PayrollAdjustment, PayrollConfig } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, DollarSign, Plus, Minus, Send, RefreshCw, Check, ChevronsUpDown, MoreHorizontal, Trash2, Search as SearchIcon, ChevronLeft, ChevronRight, Filter, Calendar as CalendarIcon, Settings, User, CreditCard, FileText } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  type: z.enum(["salary", "manual", "sprint", "task"]),
  otp: z.string().optional(),
});

export default function Payroll() {
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [wallets, setWallets] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollEmployee | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [employeeAdjustments, setEmployeeAdjustments] = useState<PayrollAdjustment[]>([]);
  const [runPayrollOpen, setRunPayrollOpen] = useState(false);
  const [banks, setBanks] = useState<{code: string, name: string}[]>([]);
  const [accountName, setAccountName] = useState<string>("");
  const [openBank, setOpenBank] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  
  // Config State
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [payrollConfig, setPayrollConfig] = useState<PayrollConfig | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter & Pagination States
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Transfer Filter & Pagination States
  const [transferSearch, setTransferSearch] = useState("");
  const [transferStatus, setTransferStatus] = useState("all");
  const [transferStartDate, setTransferStartDate] = useState("");
  const [transferEndDate, setTransferEndDate] = useState("");
  const [transferPage, setTransferPage] = useState(1);
  const [transferLimit, setTransferLimit] = useState(20);
  const [transferTotal, setTransferTotal] = useState(0);
  
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

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
                const res = await api.post("/transfers/lookup", {
                    bankCode: watchBankCode,
                    accountNumber: watchAccountNumber
                });
                if (res.data.success) {
                    setAccountName(res.data.data.account_name);
                    updateForm.setValue("account_name", res.data.data.account_name);
                } else {
                     setAccountName("Not found");
                     // Keep existing value or clear if needed, but user might want to manual entry so maybe don't clear if they typed it?
                     // Actually user said "Incase name enquiry failed, allow manual input".
                     // So we shouldn't overwrite if the user is typing, but here we are in automatic lookup.
                     // We can set it to empty if not found, or leave it. 
                     // Let's set it to empty to prompt manual entry if they haven't typed anything yet?
                     // Better yet, just show "Not found" in the helper text and let them type.
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

  const runPayrollForm = useForm<z.infer<typeof bulkTransferSchema>>({
    resolver: zodResolver(bulkTransferSchema),
    defaultValues: { source_wallet_id: "", type: "salary" },
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

      const res = await api.get<{success: boolean, payroll: PayrollEmployee[]}>(`/payroll/summary?${queryParams.toString()}`);
      const payrollData = res.data;
      const employeesData = Array.isArray(payrollData) ? payrollData : (Array.isArray(payrollData?.payroll) ? payrollData.payroll : []);
      setEmployees(employeesData);
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
      if (transferStartDate) queryParams.append("startDate", transferStartDate);
      if (transferEndDate) queryParams.append("endDate", transferEndDate);
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

  const handleTransferSearch = () => {
    setTransferPage(1);
    fetchTransfers(1);
  };

  const fetchConfig = async () => {
    try {
        const res = await api.get<{success: boolean, config: PayrollConfig}>("/payroll/config");
        if (res.data.success) {
            setPayrollConfig(res.data.config);
            configForm.reset({
                salary_interval: res.data.config.salary_interval,
                salary_custom_date: res.data.config.salary_custom_date
            });
        }
    } catch (error) {
        console.error("Failed to fetch config");
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
      // Load initial employees (page 1, no filters yet or default filters)
      fetchEmployees(1);
      fetchTransfers(1);
      fetchConfig();

      const [walletRes, banksRes] = await Promise.all([
        api.get<WalletInfo>("/wallet"),
        api.get<{success: boolean, data: {code: string, name: string}[]}>("/transfers/banks")
      ]);
      
      setWallets(walletRes.data);
      // Transfers are handled by fetchTransfers
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

  useEffect(() => {
    if (!loading) {
       fetchTransfers(transferPage);
    }
  }, [transferPage]);

  const handleSearch = () => {
    setPage(1);
    fetchEmployees(1);
  };

  const fetchAdjustments = async (userId: string) => {
    try {
      const res = await api.get<{success: boolean, adjustments: PayrollAdjustment[]}>(`/payroll/adjustments?userId=${userId}`);
      if (res.data.success) {
        setEmployeeAdjustments(res.data.adjustments);
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
        // account_name is now in values
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
      });
      toast({ title: "Success", description: "Adjustment added" });
      setAdjustmentDialogOpen(false);
      fetchData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to add adjustment", variant: "destructive" });
    }
  };

  const onRunPayroll = async (values: z.infer<typeof bulkTransferSchema>) => {
    try {
      if (!otpSent) {
        // Step 1: Request OTP
        setOtpLoading(true);
        try {
          // Use the source wallet ID for the request
          await api.post("/transfers/otp/request", { wallet_id: values.source_wallet_id });
          setOtpSent(true);
          toast({ title: "OTP Sent", description: "Please enter the OTP sent to your registered contact." });
        } catch (error) {
           toast({ title: "Error", description: "Failed to send OTP", variant: "destructive" });
        } finally {
           setOtpLoading(false);
        }
        return;
      }

      // Step 2: Submit with OTP
      if (!values.otp) {
        toast({ title: "Error", description: "Please enter the OTP", variant: "destructive" });
        return;
      }

      await api.post("/transfers/bulk", values);
      toast({ title: "Success", description: "Payroll run initiated" });
      setRunPayrollOpen(false);
      setOtpSent(false); // Reset for next time
      runPayrollForm.reset();
      fetchData();
    } catch (error: any) {
      const msg = error.response?.data?.message || "Failed to run payroll";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const retryTransfer = async (id: string) => {
    setRetryingId(id);
    try {
      await api.post(`/transfers/${id}/retry`);
      toast({ title: "Success", description: "Transfer retry initiated" });
      fetchData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to retry transfer", variant: "destructive" });
    } finally {
      setRetryingId(null);
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
            <h2 className="text-3xl font-bold tracking-tight">Payroll & Transfers</h2>
            <p className="text-muted-foreground">Manage salaries and bulk transfers.</p>
          </div>
          <div className="flex gap-2">
             <Button variant="outline" onClick={() => setConfigDialogOpen(true)}>
               <Settings className="mr-2 h-4 w-4" /> Configuration
             </Button>
             <Button onClick={() => setRunPayrollOpen(true)}>
               <Send className="mr-2 h-4 w-4" /> Run Payroll
             </Button>
           </div>
        </div>

        <Tabs defaultValue="employees">
          <TabsList>
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="history">Transfer History</TabsTrigger>
          </TabsList>
          
          <TabsContent value="employees" className="space-y-4">
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

              <Button onClick={handleSearch}>
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
                            <Badge variant={emp.salary_calculation_status === 'standard' ? 'default' : 'secondary'}>
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
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
             {/* Filters for Transfer History */}
            <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-lg border shadow-sm">
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <p className="text-sm font-medium">Search</p>
                <div className="relative">
                   <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                   <Input 
                      placeholder="Name, Account or Reference" 
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
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                 </Select>
              </div>

              <div className="grid w-full max-w-[150px] items-center gap-1.5">
                 <p className="text-sm font-medium">Start Date</p>
                 <Input 
                    type="date" 
                    value={transferStartDate}
                    onChange={(e) => setTransferStartDate(e.target.value)}
                 />
              </div>

              <div className="grid w-full max-w-[150px] items-center gap-1.5">
                 <p className="text-sm font-medium">End Date</p>
                 <Input 
                    type="date" 
                    value={transferEndDate}
                    onChange={(e) => setTransferEndDate(e.target.value)}
                 />
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
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(transfers) && transfers.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.recipient_name}</TableCell>
                        <TableCell>{t.currency} {t.amount.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={t.status === 'success' ? 'default' : t.status === 'failed' ? 'destructive' : 'secondary'}>
                            {t.status}
                          </Badge>
                          {t.failure_reason && <p className="text-xs text-red-500 mt-1">{t.failure_reason}</p>}
                        </TableCell>
                        <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {t.status === 'failed' && (
                            <Button variant="outline" size="sm" onClick={() => retryTransfer(t.id)}>
                              <RefreshCw className="h-4 w-4 mr-1" /> Retry
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
                      disabled={transferPage * transferLimit >= transferTotal}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
              </CardContent>
            </Card>
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
                            <Badge variant={selectedEmployee.salary_calculation_status === 'standard' ? 'default' : 'secondary'} className="mt-1">
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

                {/* Legacy Adjustments (Optional/Collapsible) */}
                {employeeAdjustments.length > 0 && (
                     <div className="border-t pt-4">
                        <h4 className="font-semibold mb-2 text-sm text-muted-foreground">Legacy Manual Adjustments</h4>
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

        {/* Update Dialog */}
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
                      <FormControl><Input {...field} placeholder="Account Name" /></FormControl>
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
        
        {/* Run Payroll Dialog (Simplified) */}
        <Dialog open={runPayrollOpen} onOpenChange={setRunPayrollOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Run Payroll</DialogTitle>
                    <DialogDescription>
                        Initiate bulk transfer for all employees?
                    </DialogDescription>
                </DialogHeader>
                <Form {...runPayrollForm}>
                    <form onSubmit={runPayrollForm.handleSubmit(onRunPayroll)} className="space-y-4">
                        <FormField
                            control={runPayrollForm.control}
                            name="source_wallet_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Source Wallet</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={otpSent}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select wallet" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {wallets?.business_wallet && (
                                                <SelectItem value={wallets.business_wallet.id}>
                                                    Business Wallet ({wallets.business_wallet.currency} {wallets.business_wallet.balance.toLocaleString()})
                                                </SelectItem>
                                            )}
                                            {wallets?.user_wallet && (
                                                <SelectItem value={wallets.user_wallet.id}>
                                                    Personal Wallet ({wallets.user_wallet.currency} {wallets.user_wallet.balance.toLocaleString()})
                                                </SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        
                        {otpSent && (
                             <FormField
                                control={runPayrollForm.control}
                                name="otp"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Enter OTP</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="Enter 6-digit OTP" maxLength={6} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <DialogFooter>
                            {otpSent ? (
                                <Button type="submit" disabled={runPayrollForm.formState.isSubmitting}>
                                    {runPayrollForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Confirm Transfer
                                </Button>
                            ) : (
                                <Button type="submit" disabled={otpLoading}>
                                    {otpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Send OTP & Continue
                                </Button>
                            )}
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}
