import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import {
  WalletHistoryResponse,
  WalletHistoryWallet,
  WalletTransaction,
} from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Inbox,
  Loader2,
  RotateCcw,
  Search as SearchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadCsvExport, csvFilename } from "@/lib/csv-download";
import { useToast } from "@/components/ui/use-toast";

const PAGE_SIZE = 20;

interface WalletTransactionsProps {
  /** Optional initial wallet options; refreshed from the history response */
  wallets?: WalletHistoryWallet[];
  /** Bump to refetch after external actions (e.g. funding) */
  refreshKey?: number;
  /** Callback invoked after a CSV export attempt (success or failure) */
  onExported?: () => void;
}

interface FilterState {
  wallet_id: string;
  direction: "all" | "credit" | "debit";
  search: string;
  min_amount: string;
  max_amount: string;
  start_date: string;
  end_date: string;
}

const EMPTY_FILTERS: FilterState = {
  wallet_id: "all",
  direction: "all",
  search: "",
  min_amount: "",
  max_amount: "",
  start_date: "",
  end_date: "",
};

function formatAmount(amount: number | string): string {
  const n = Number(amount);
  return isNaN(n) ? String(amount) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  if (s === "success" || s === "successful") {
    return (
      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10">
        Success
      </Badge>
    );
  }
  if (s === "failed") {
    return (
      <Badge variant="secondary" className="bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/10">
        Failed
      </Badge>
    );
  }
  if (s === "pending" || s === "processing") {
    return (
      <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10">
        {s === "pending" ? "Pending" : "Processing"}
      </Badge>
    );
  }
  if (s === "cancelled") {
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground hover:bg-muted">
        Cancelled
      </Badge>
    );
  }
  return <Badge variant="outline" className="capitalize">{status || "—"}</Badge>;
}

function DirectionAmount({ tx }: { tx: WalletTransaction }) {
  const currency = tx.currency || tx.wallet_currency || "NGN";
  const isCredit = tx.direction === "credit";
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-1 font-semibold tabular-nums whitespace-nowrap",
        isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      )}
    >
      {isCredit ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
      <span>
        {isCredit ? "+" : "\u2212"} {currency} {formatAmount(tx.amount)}
      </span>
    </div>
  );
}

export function WalletTransactions({ wallets: initialWallets, refreshKey = 0, onExported }: WalletTransactionsProps) {
  const { toast } = useToast();

  const [walletOptions, setWalletOptions] = useState<WalletHistoryWallet[]>(initialWallets || []);
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const buildQuery = useCallback(
    (filters: FilterState, currentPage: number, format?: "json" | "csv") => {
      const params = new URLSearchParams();
      if (filters.wallet_id && filters.wallet_id !== "all") params.append("wallet_id", filters.wallet_id);
      if (filters.direction && filters.direction !== "all") params.append("direction", filters.direction);
      if (filters.search.trim()) params.append("search", filters.search.trim());
      if (filters.min_amount.trim() && !isNaN(Number(filters.min_amount))) params.append("min_amount", filters.min_amount.trim());
      if (filters.max_amount.trim() && !isNaN(Number(filters.max_amount))) params.append("max_amount", filters.max_amount.trim());
      if (filters.start_date) params.append("start_date", filters.start_date);
      if (filters.end_date) params.append("end_date", filters.end_date);
      if (format) {
        params.append("format", format);
      } else {
        params.append("page", String(currentPage));
        params.append("limit", String(PAGE_SIZE));
      }
      return params.toString();
    },
    []
  );

  const fetchHistory = useCallback(
    async (currentPage: number, filters: FilterState) => {
      setLoading(true);
      try {
        const res = await api.get<WalletHistoryResponse>(`/wallet/history?${buildQuery(filters, currentPage)}`);
        if (res.data?.success) {
          setTransactions(Array.isArray(res.data.data) ? res.data.data : []);
          if (res.data.pagination) setPagination(res.data.pagination);
          if (Array.isArray(res.data.wallets) && res.data.wallets.length > 0) {
            setWalletOptions(res.data.wallets);
          }
        } else {
          setTransactions([]);
        }
      } catch (error: any) {
        console.error("Failed to fetch wallet history", error);
        toast({
          title: "Error",
          description: error.response?.data?.error || error.response?.data?.message || "Failed to load transactions",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildQuery]
  );

  useEffect(() => {
    fetchHistory(page, applied);
  }, [page, applied, refreshKey, fetchHistory]);

  const handleApply = () => {
    setPage(1);
    setApplied({ ...draft });
  };

  const handleReset = () => {
    setDraft({ ...EMPTY_FILTERS });
    setApplied({ ...EMPTY_FILTERS });
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadCsvExport(`/wallet/history?${buildQuery(applied, page, "csv")}`, csvFilename("wallet-transactions"));
      toast({ title: "Export ready", description: "Your transactions CSV has been downloaded." });
      onExported?.();
    } catch (error: any) {
      console.error("Failed to export transactions", error);
      toast({
        title: "Export failed",
        description: error.response?.data?.error || error.message || "Could not export transactions right now.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const activeFilterCount = useMemo(() => {
    return (
      Object.entries(applied).filter(([key, value]) => key !== "wallet_id" && value && value !== "all").length +
      (applied.wallet_id !== "all" ? 1 : 0)
    );
  }, [applied]);

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="gap-3 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>
              Every credit and debit across your wallets — funding, transfers, fees and refunds.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {pagination.total > 0 && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {pagination.total} transaction{pagination.total === 1 ? "" : "s"}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || loading}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="grid w-full gap-1.5 lg:w-44">
            <p className="text-xs font-medium text-muted-foreground">Wallet</p>
            <Select value={draft.wallet_id} onValueChange={(v) => setDraft((d) => ({ ...d, wallet_id: v }))}>
              <SelectTrigger aria-label="Filter by wallet">
                <SelectValue placeholder="All wallets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All wallets</SelectItem>
                {walletOptions.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.currency} wallet · {Number(w.balance).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid w-full gap-1.5 lg:w-36">
            <p className="text-xs font-medium text-muted-foreground">Direction</p>
            <Select
              value={draft.direction}
              onValueChange={(v) => setDraft((d) => ({ ...d, direction: v as FilterState["direction"] }))}
            >
              <SelectTrigger aria-label="Filter by direction">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="debit">Debit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid w-full flex-1 gap-1.5 lg:min-w-[180px]">
            <p className="text-xs font-medium text-muted-foreground">Search</p>
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Reference, description or ID"
                value={draft.search}
                onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleApply()}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:flex lg:w-44 lg:gap-1.5">
            <div className="grid gap-1.5 lg:w-20">
              <p className="text-xs font-medium text-muted-foreground">Min</p>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                className="h-9"
                value={draft.min_amount}
                onChange={(e) => setDraft((d) => ({ ...d, min_amount: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5 lg:w-20">
              <p className="text-xs font-medium text-muted-foreground">Max</p>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="∞"
                className="h-9"
                value={draft.max_amount}
                onChange={(e) => setDraft((d) => ({ ...d, max_amount: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:flex lg:w-52 lg:gap-1.5">
            <div className="grid gap-1.5 lg:w-24">
              <p className="text-xs font-medium text-muted-foreground">From</p>
              <Input
                type="date"
                className="h-9"
                value={draft.start_date}
                onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5 lg:w-24">
              <p className="text-xs font-medium text-muted-foreground">To</p>
              <Input
                type="date"
                className="h-9"
                value={draft.end_date}
                onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleApply}>
              <Filter className="mr-1.5 h-3.5 w-3.5" /> Apply
            </Button>
            <Button size="sm" variant="ghost" onClick={handleReset}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
          {activeFilterCount > 0 && (
            <p className="text-xs text-muted-foreground lg:ml-auto">
              {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                        <Inbox className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">No transactions found</p>
                      <p className="max-w-xs text-xs text-muted-foreground">
                        {activeFilterCount > 0
                          ? "Try adjusting or resetting your filters."
                          : "Fund your wallet or make a transfer and it will show up here."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id} className="hover:bg-muted/40">
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {tx.created_at
                        ? new Date(tx.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <p className="truncate font-medium" title={tx.description || tx.reference}>
                        {tx.description || tx.reference || "Transaction"}
                      </p>
                      {tx.reference && (
                        <p className="truncate font-mono text-xs text-muted-foreground" title={tx.reference}>
                          {tx.reference}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="max-w-[140px] truncate font-normal capitalize">
                        {(tx.transaction_type || "transaction").replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={tx.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DirectionAmount tx={tx} />
                      {tx.fee !== null && tx.fee !== undefined && Number(tx.fee) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          fee {tx.currency || tx.wallet_currency || "NGN"} {formatAmount(tx.fee)}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 mt-4">
            <p className="text-xs text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages || loading}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default WalletTransactions;
