import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { Transfer, Wallet } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  Copy,
  Download,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Plus,
  User,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { downloadCsvExport, csvFilename } from "@/lib/csv-download";

export default function TransferHistory() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [walletOptions, setWalletOptions] = useState<Wallet[]>([]);
  const [exporting, setExporting] = useState(false);

  // Transfer Filter & Pagination States
  const [transferSearch, setTransferSearch] = useState("");
  const [transferStatus, setTransferStatus] = useState("all");
  const [transferDirection, setTransferDirection] = useState("all");
  const [transferWalletId, setTransferWalletId] = useState("all");
  const [transferMinAmount, setTransferMinAmount] = useState("");
  const [transferMaxAmount, setTransferMaxAmount] = useState("");
  const [transferStartDate, setTransferStartDate] = useState("");
  const [transferEndDate, setTransferEndDate] = useState("");
  const [transferPage, setTransferPage] = useState(1);
  const [transferLimit, setTransferLimit] = useState(20);
  const [transferTotal, setTransferTotal] = useState(0);

  // "Make New Transfer" chooser -> routes to the Individual (wallet) or Bulk
  // (payroll payout) flow via deep links handled by those pages.
  const navigate = useNavigate();
  const [newTransferOpen, setNewTransferOpen] = useState(false);

  const fetchBanks = async () => {
    try {
      const response = await api.get("/transfers/banks");
      if (response.data.data) {
        setBanks(response.data.data);
      }
    } catch (error) {
      console.error("Failed to fetch banks", error);
    }
  };

  const fetchWallets = async () => {
    try {
      const res = await api.get("/wallet");
      setWalletOptions(
        [res.data?.user_wallet, res.data?.business_wallet].filter(Boolean) as Wallet[]
      );
    } catch (error) {
      console.error("Failed to fetch wallets", error);
    }
  };

  // Helper to get bank name from code
  const getBankName = (bankCode: string) => {
    const bank = banks.find(b => b.code === bankCode);
    return bank ? bank.name : `Bank (${bankCode})`;
  };

  const buildQuery = (page: number, format?: "json" | "csv") => {
    const queryParams = new URLSearchParams();
    if (transferSearch.trim()) queryParams.append("search", transferSearch.trim());
    if (transferStatus && transferStatus !== "all") queryParams.append("status", transferStatus);
    if (transferDirection && transferDirection !== "all") queryParams.append("direction", transferDirection);
    if (transferWalletId && transferWalletId !== "all") queryParams.append("walletId", transferWalletId);
    if (transferMinAmount.trim() && !isNaN(Number(transferMinAmount))) queryParams.append("minAmount", transferMinAmount.trim());
    if (transferMaxAmount.trim() && !isNaN(Number(transferMaxAmount))) queryParams.append("maxAmount", transferMaxAmount.trim());
    if (transferStartDate) queryParams.append("startDate", transferStartDate);
    if (transferEndDate) queryParams.append("endDate", transferEndDate);
    if (format) {
      queryParams.append("format", format);
    } else {
      queryParams.append("page", page.toString());
      queryParams.append("limit", transferLimit.toString());
    }
    return queryParams.toString();
  };

  const fetchTransfers = async (currentPage = transferPage) => {
    try {
      setLoading(true);
      const res = await api.get<{
          success: boolean,
          data: Transfer[],
          pagination: { total: number, page: number, limit: number }
      }>(`/transfers?${buildQuery(currentPage)}`);

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
    } finally {
        setLoading(false);
    }
  };

  const handleTransferSearch = () => {
    setTransferPage(1);
    fetchTransfers(1);
  };

  const handleResetFilters = () => {
    setTransferSearch("");
    setTransferStatus("all");
    setTransferDirection("all");
    setTransferWalletId("all");
    setTransferMinAmount("");
    setTransferMaxAmount("");
    setTransferStartDate("");
    setTransferEndDate("");
    setTransferPage(1);
    // fetch with cleared filters via effect on transferPage won't refire if page already 1
    setTransferPage((p) => {
      if (p === 1) {
        fetchTransfers(1);
      }
      return 1;
    });
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      await downloadCsvExport(`/transfers?${buildQuery(transferPage, "csv")}`, csvFilename("transfer-history"));
      toast({ title: "Export ready", description: "Your transfer history CSV has been downloaded." });
    } catch (error: any) {
      console.error("Failed to export transfer history", error);
      toast({
        title: "Export failed",
        description: error.response?.data?.error || error.message || "Could not export transfer history right now.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
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

  useEffect(() => {
    fetchTransfers(transferPage);
  }, [transferPage]);

  useEffect(() => {
    fetchBanks();
    fetchWallets();
  }, []);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(transferTotal / transferLimit)),
    [transferTotal, transferLimit]
  );

  const activeFilterCount = useMemo(() => {
    return [
      transferSearch.trim(),
      transferStatus !== "all" ? transferStatus : "",
      transferDirection !== "all" ? transferDirection : "",
      transferWalletId !== "all" ? transferWalletId : "",
      transferMinAmount.trim(),
      transferMaxAmount.trim(),
      transferStartDate,
      transferEndDate,
    ].filter(Boolean).length;
  }, [transferSearch, transferStatus, transferDirection, transferWalletId, transferMinAmount, transferMaxAmount, transferStartDate, transferEndDate]);

  /** Display title for a ledger row: transfers use recipient, transactions use description */
  const rowTitle = (t: Transfer) =>
    t.type === "transaction"
      ? t.description || t.remark || t.recipient_name || "Transaction"
      : t.recipient_name || "Transfer";

  /** Amount cell with direction coloring: credits green/+, debits red/- */
  const AmountCell = ({ t }: { t: Transfer }) => {
    const isCredit = t.direction === "credit" || t.type === "transaction" && t.direction === "credit";
    const isDebit = t.type === "transfer" || t.direction === "debit";
    return (
      <div
        className={cn(
          "flex items-center gap-1 font-semibold tabular-nums whitespace-nowrap",
          isCredit ? "text-emerald-600 dark:text-emerald-400" : isDebit ? "text-red-600 dark:text-red-400" : ""
        )}
      >
        {isCredit ? <ArrowDownLeft className="h-3.5 w-3.5" /> : isDebit ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
        <span>
          {isCredit ? "+" : isDebit ? "\u2212" : ""} {t.currency} {Number(t.amount).toLocaleString()}
        </span>
      </div>
    );
  };

  return (
    <Layout>
      <div className="p-8 space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Transfer History</h2>
            <p className="text-muted-foreground">Every payout and wallet credit — searchable, filterable, exportable.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExportCsv} disabled={exporting || loading}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export CSV
            </Button>
            <Button onClick={() => setNewTransferOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Make New Transfer
            </Button>
          </div>
        </div>

        {/* New Transfer chooser: Individual vs Bulk */}
        <Dialog open={newTransferOpen} onOpenChange={setNewTransferOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Make New Transfer</DialogTitle>
              <DialogDescription>Choose how you want to send money.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2 py-1">
              <button
                type="button"
                onClick={() => {
                  setNewTransferOpen(false);
                  navigate("/wallet?transfer=new");
                }}
                className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400">
                  <User className="h-5 w-5" />
                </span>
                <span className="font-semibold">Individual Transfer</span>
                <span className="text-xs text-muted-foreground">Send to a single bank account — local or international.</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewTransferOpen(false);
                  navigate("/payroll?transfer=new");
                }}
                className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/10 text-violet-600 dark:text-violet-400">
                  <Users className="h-5 w-5" />
                </span>
                <span className="font-semibold">Bulk Transfer</span>
                <span className="text-xs text-muted-foreground">Pay multiple recipients at once (salary payouts).</span>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end bg-card p-4 rounded-xl border shadow-sm">
            <div className="grid w-full gap-1.5 lg:w-44">
              <p className="text-xs font-medium text-muted-foreground">Wallet</p>
              <Select value={transferWalletId} onValueChange={setTransferWalletId}>
                <SelectTrigger aria-label="Filter by wallet">
                  <SelectValue placeholder="All wallets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All wallets</SelectItem>
                  {walletOptions.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.currency} wallet
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid w-full gap-1.5 lg:w-36">
              <p className="text-xs font-medium text-muted-foreground">Direction</p>
              <Select value={transferDirection} onValueChange={setTransferDirection}>
                <SelectTrigger aria-label="Filter by direction">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="credit">Credits</SelectItem>
                  <SelectItem value="debit">Debits</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid w-full gap-1.5 lg:w-36">
                <p className="text-xs font-medium text-muted-foreground">Status</p>
                <Select value={transferStatus} onValueChange={setTransferStatus}>
                <SelectTrigger aria-label="Filter by status">
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

            <div className="grid w-full gap-1.5 lg:w-40">
                <p className="text-xs font-medium text-muted-foreground">Search</p>
                <Input
                    placeholder="Recipient or reference"
                    value={transferSearch}
                    onChange={(e) => setTransferSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleTransferSearch()}
                />
            </div>

            <div className="grid grid-cols-2 gap-2 lg:flex lg:w-40 lg:gap-1.5">
                <div className="grid gap-1.5 lg:w-20">
                  <p className="text-xs font-medium text-muted-foreground">Min</p>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-9"
                    value={transferMinAmount}
                    onChange={(e) => setTransferMinAmount(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5 lg:w-20">
                  <p className="text-xs font-medium text-muted-foreground">Max</p>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="∞"
                    className="h-9"
                    value={transferMaxAmount}
                    onChange={(e) => setTransferMaxAmount(e.target.value)}
                  />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:flex lg:w-52 lg:gap-1.5">
                <div className="grid gap-1.5 lg:w-24">
                  <p className="text-xs font-medium text-muted-foreground">Start Date</p>
                  <Input
                    type="date"
                    className="h-9"
                    value={transferStartDate}
                    onChange={(e) => setTransferStartDate(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5 lg:w-24">
                  <p className="text-xs font-medium text-muted-foreground">End Date</p>
                  <Input
                    type="date"
                    className="h-9"
                    value={transferEndDate}
                    onChange={(e) => setTransferEndDate(e.target.value)}
                  />
                </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleTransferSearch} size="sm">
                <Filter className="mr-1.5 h-3.5 w-3.5" /> Filter
              </Button>
              <Button onClick={handleResetFilters} size="sm" variant="ghost">
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
              </Button>
            </div>
            {activeFilterCount > 0 && (
              <p className="text-xs text-muted-foreground lg:ml-auto">
                {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active
              </p>
            )}
        </div>

        <Card className="rounded-xl shadow-sm">
            <CardHeader>
            <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
                <TableHeader>
                <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Recipient / Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Action</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {loading && transfers.length === 0
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`skeleton-${i}`}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 w-full animate-pulse rounded bg-muted" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : Array.isArray(transfers) && transfers.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => {
                        setSelectedTransfer(t);
                        setShowDetailModal(true);
                    }}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                        {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                        <p className="truncate font-medium">{rowTitle(t)}</p>
                        {t.type === "transaction" && t.recipient_name && t.description && (
                          <p className="truncate text-xs text-muted-foreground">{t.recipient_name}</p>
                        )}
                    </TableCell>
                    <TableCell>
                        <Badge variant="outline" className="font-normal capitalize">
                          {t.type === "transaction" ? (t.transaction_type || "credit").replace(/_/g, " ") : "transfer"}
                        </Badge>
                    </TableCell>
                    <TableCell>
                        <Badge variant={t.status === 'success' ? 'default' : t.status === 'failed' ? 'destructive' : 'secondary'}>
                        {t.status}
                        </Badge>
                        {t.failure_reason && <p className="text-xs text-red-500 mt-1 max-w-[160px] truncate">{t.failure_reason}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                        <AmountCell t={t} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                        {t.type !== "transaction" && t.status === 'failed' && (
                        <Button variant="outline" size="sm" onClick={() => retryTransfer(t.id)} disabled={retryingId === t.id}>
                            {retryingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                            Retry
                        </Button>
                        )}
                    </TableCell>
                    </TableRow>
                ))}
                {!loading && transfers.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={6} className="text-center h-24">
                        No history found{activeFilterCount > 0 ? " — try adjusting your filters." : "."}
                        </TableCell>
                    </TableRow>
                )}
                </TableBody>
            </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 py-4 border-t mt-4">
                <p className="text-xs text-muted-foreground">
                  Page {transferPage} of {totalPages} · {transferTotal} record{transferTotal === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTransferPage(p => Math.max(1, p - 1))}
                      disabled={transferPage === 1 || loading}
                  >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                  </Button>
                  <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTransferPage(p => Math.min(totalPages, p + 1))}
                      disabled={transferPage >= totalPages || loading}
                  >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
            </div>
            </CardContent>
        </Card>

        {/* Transfer Detail Modal */}
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
            <DialogContent className="max-w-2xl">
                {selectedTransfer && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-xl">
                              {selectedTransfer.type === "transaction" ? "Transaction Details" : "Transfer Details"}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-6 py-4">
                            {/* Receipt hero: gradient card with amount, type + status chips */}
                            <div className="rounded-2xl p-6 text-white bg-gradient-to-br from-blue-600 to-violet-600 shadow-lg">
                                <div className="flex flex-col items-center gap-3 text-center">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                                        {(() => {
                                            const isCredit = selectedTransfer.direction === "credit" || selectedTransfer.type === "transaction" && selectedTransfer.direction !== "debit";
                                            return isCredit
                                                ? <ArrowDownLeft className="h-6 w-6" />
                                                : <ArrowUpRight className="h-6 w-6" />;
                                        })()}
                                    </div>
                                    <div className="text-3xl font-extrabold tracking-tight">
                                        {selectedTransfer.currency} {Number(selectedTransfer.amount).toLocaleString()}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="rounded-full bg-white/25 px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
                                            {(() => {
                                                const isCredit = selectedTransfer.direction === "credit" || selectedTransfer.type === "transaction" && selectedTransfer.direction !== "debit";
                                                const t = (selectedTransfer.transaction_type || "").toLowerCase();
                                                return (isCredit || t === "refund") ? "Credit" : "Debit";
                                            })()}
                                        </span>
                                        <span className="rounded-full bg-black/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
                                            {selectedTransfer.status}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Reference</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono">{selectedTransfer.reference}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => {
                                                navigator.clipboard.writeText(selectedTransfer.reference || "");
                                                toast({ title: "Copied" });
                                            }}
                                        >
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                                {Number(selectedTransfer.fee) > 0 && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Fee</span>
                                        <span>{selectedTransfer.currency} {Number(selectedTransfer.fee).toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Channel</span>
                                    <Badge variant="outline" className="font-normal capitalize">
                                      {selectedTransfer.type === "transaction"
                                        ? (selectedTransfer.transaction_type || "credit").replace(/_/g, " ")
                                        : "transfer"}
                                    </Badge>
                                </div>
                            </div>

                            {selectedTransfer.type === "transaction" ? (
                              <div className="border-t pt-4">
                                  <h4 className="font-medium mb-3">Description</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedTransfer.description || selectedTransfer.remark || "—"}
                                  </p>
                              </div>
                            ) : (
                              <div className="border-t pt-4">
                                  <h4 className="font-medium mb-3">Recipient Information</h4>
                                  <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                          <span className="text-sm text-muted-foreground">Name</span>
                                          <span>{selectedTransfer.recipient_name || "—"}</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                          <span className="text-sm text-muted-foreground">Account Number</span>
                                          <span className="font-mono">{selectedTransfer.recipient_account || "N/A"}</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                          <span className="text-sm text-muted-foreground">Bank</span>
                                          <span>{selectedTransfer.recipient_bank ? getBankName(selectedTransfer.recipient_bank) : "N/A"}</span>
                                      </div>
                                  </div>
                              </div>
                            )}

                            <div className="border-t pt-4">
                                <h4 className="font-medium mb-3">Transaction Dates</h4>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Created At</span>
                                        <span>{selectedTransfer.created_at ? format(new Date(selectedTransfer.created_at), "MMM d, yyyy h:mm a") : "—"}</span>
                                    </div>
                                    {selectedTransfer.updated_at && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground">Updated At</span>
                                            <span>{format(new Date(selectedTransfer.updated_at), "MMM d, yyyy h:mm a")}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {selectedTransfer.remark && selectedTransfer.type !== "transaction" && (
                                <div className="border-t pt-4">
                                    <h4 className="font-medium mb-3">Remark</h4>
                                    <p className="text-muted-foreground">{selectedTransfer.remark}</p>
                                </div>
                            )}

                            {selectedTransfer.failure_reason && (
                                <div className="border-t pt-4">
                                    <h4 className="font-medium mb-3 text-red-500">Failure Reason</h4>
                                    <p className="text-red-500">{selectedTransfer.failure_reason}</p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
