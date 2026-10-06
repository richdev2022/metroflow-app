import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  ReceiptText,
  RefreshCw,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * EntityTransactionsDrawer — shared "all transactions for this entity" drill-down
 * used by the Payment Links manager and the Subscriptions (recurring billing)
 * manager.
 *
 *  - kind "payment-link": GET /payment-links/:id/payments → { payments } rows
 *    (payment_link_payments: amount, fee, net_amount, currency, status,
 *    payer_name/email, transaction_reference, created_at). Renders a collected
 *    totals row (sum of successful net amounts + count) and an "Open public
 *    link" action.
 *  - kind "subscription": GET /subscription/transactions?subscriber_id=…&
 *    subscriber_email=…&page=&perPage=&status= → standard transaction rows with
 *    pagination { total, page, perPage, totalPages }. Renders date, reference,
 *    amount, plan and status with a status filter + page controls.
 */

export type EntityTransactionsTarget =
  | {
      kind: "payment-link";
      id: string;
      title: string;
      subtitle?: string;
      publicUrl?: string;
    }
  | {
      kind: "subscription";
      id: string;
      subscriberEmail: string;
      title: string;
      subtitle?: string;
    };

interface LinkPayment {
  id: string;
  transaction_reference?: string;
  payer_name?: string | null;
  payer_email?: string | null;
  amount?: string | number;
  fee?: string | number;
  net_amount?: string | number;
  currency?: string;
  status?: string;
  payment_provider?: string | null;
  created_at?: string;
}

interface SubscriptionTx {
  id: string;
  reference?: string;
  amount?: string | number;
  currency?: string;
  status?: string;
  plan_name?: string | null;
  created_at?: string;
}

const PER_PAGE = 10;

const fmtMoney = (v: unknown, currency = "NGN") => {
  const n = Number(v) || 0;
  const symbol =
    currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  return `${symbol}${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const statusChipClass = (status?: string) => {
  switch (status) {
    case "success":
    case "active":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "pending":
    case "awaiting_payment":
    case "past_due":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-500";
    case "failed":
    case "reversed":
      return "bg-red-500/10 text-red-600 dark:text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const StatusChip = ({ status }: { status?: string }) => (
  <span
    className={cn(
      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
      statusChipClass(status),
    )}
  >
    {(status || "unknown").replace(/_/g, " ")}
  </span>
);

const SUBSCRIPTION_STATUS_FILTERS = ["", "success", "pending", "failed", "cancelled"] as const;

export default function EntityTransactionsDrawer({
  target,
  onClose,
}: {
  target: EntityTransactionsTarget | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [linkPayments, setLinkPayments] = useState<LinkPayment[]>([]);
  const [subRows, setSubRows] = useState<SubscriptionTx[]>([]);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [pagination, setPagination] = useState<{ total: number; totalPages: number } | null>(null);

  const isLink = target?.kind === "payment-link";

  // Payment-link payments: one shot (server caps at the 200 newest).
  const fetchLinkPayments = useCallback(async (linkId: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/payment-links/${linkId}/payments`);
      setLinkPayments(res.data?.payments || []);
    } catch {
      toast.error("Could not load this link's payments");
      setLinkPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscription drill-down: paged + status-filtered transaction rows for the
  // subscriber this subscription belongs to.
  const fetchSubscriptionTx = useCallback(
    async (
      subscriberId: string,
      subscriberEmail: string,
      nextPage: number,
      status: string,
    ) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          subscriber_id: subscriberId,
          subscriber_email: subscriberEmail,
          page: String(nextPage),
          perPage: String(PER_PAGE),
        });
        if (status) params.set("status", status);
        const res = await api.get(`/subscription/transactions?${params.toString()}`);
        setSubRows(res.data?.data || []);
        const p = res.data?.pagination;
        setPagination({
          total: Number(p?.total ?? (res.data?.data || []).length),
          totalPages: Number(p?.totalPages ?? 1),
        });
      } catch {
        toast.error("Could not load this subscriber's transactions");
        setSubRows([]);
        setPagination(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!target) return;
    setPage(1);
    setStatusFilter("");
    setPagination(null);
    if (target.kind === "payment-link") {
      fetchLinkPayments(target.id);
    } else {
      fetchSubscriptionTx(target.id, target.subscriberEmail, 1, "");
    }
  }, [target, fetchLinkPayments, fetchSubscriptionTx]);

  const changePage = (nextPage: number) => {
    if (!target || target.kind !== "subscription") return;
    setPage(nextPage);
    fetchSubscriptionTx(target.id, target.subscriberEmail, nextPage, statusFilter);
  };

  const changeStatusFilter = (status: string) => {
    if (!target || target.kind !== "subscription") return;
    setStatusFilter(status);
    setPage(1);
    fetchSubscriptionTx(target.id, target.subscriberEmail, 1, status);
  };

  // Collected totals per currency (net of fee — matches the card header's
  // total_collected stat which sums net_amount of successful payments).
  const totalsByCurrency: Record<string, { collected: number; count: number }> = {};
  for (const p of linkPayments) {
    if (p.status !== "success") continue;
    const cur = (p.currency || "NGN").toUpperCase();
    const bucket = (totalsByCurrency[cur] ||= { collected: 0, count: 0 });
    bucket.collected += Number(p.net_amount ?? p.amount) || 0;
    bucket.count += 1;
  }
  const pendingCount = linkPayments.filter((p) => p.status === "pending").length;
  const failedCount = linkPayments.filter((p) => p.status === "failed").length;

  return (
    <Drawer open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto max-h-[85vh] w-full sm:max-w-lg">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DrawerTitle className="truncate">
                {isLink ? "Payments — " : "Transactions — "}
                {target?.title}
              </DrawerTitle>
              <DrawerDescription className="truncate">
                {target?.subtitle || (isLink ? "Every payment received through this link" : "Every charge for this subscriber")}
              </DrawerDescription>
            </div>
            {isLink && (target as { publicUrl?: string }).publicUrl && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() =>
                  window.open((target as { publicUrl?: string }).publicUrl, "_blank")
                }
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open public link
              </Button>
            )}
          </div>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-6">
          {/* Totals row — payment links */}
          {isLink && !loading && (
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-muted/30 px-3 py-2 text-sm">
              {Object.keys(totalsByCurrency).length === 0 ? (
                <span className="text-muted-foreground">Collected {fmtMoney(0)} · 0 successful</span>
              ) : (
                Object.entries(totalsByCurrency).map(([cur, t]) => (
                  <span key={cur} className="font-medium">
                    Collected {fmtMoney(t.collected, cur)} · {t.count} successful
                  </span>
                ))
              )}
              {pendingCount > 0 && (
                <span className="text-xs text-amber-600 dark:text-amber-500">{pendingCount} pending</span>
              )}
              {failedCount > 0 && (
                <span className="text-xs text-red-600 dark:text-red-400">{failedCount} failed</span>
              )}
            </div>
          )}

          {/* Status filter — subscription transactions */}
          {!isLink && (
            <div className="mb-3 flex items-center justify-between gap-2">
              <select
                value={statusFilter}
                onChange={(e) => changeStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Filter by status"
              >
                {SUBSCRIPTION_STATUS_FILTERS.map((s) => (
                  <option key={s || "all"} value={s}>
                    {s ? `Status: ${s}` : "All statuses"}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="ghost"
                disabled={loading || !target}
                onClick={() => target && target.kind === "subscription" && fetchSubscriptionTx(target.id, target.subscriberEmail, page, statusFilter)}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                <span className="ml-1.5">Refresh</span>
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex h-28 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : isLink ? (
            linkPayments.length === 0 ? (
              <div className="py-10 text-center">
                <ReceiptText className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No payments yet. Share the link to start collecting.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {linkPayments.map((p) => (
                  <div key={p.id} className="rounded-xl border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {p.payer_name || p.payer_email || "Payment"}
                        </p>
                        {p.payer_name && p.payer_email && (
                          <p className="truncate text-xs text-muted-foreground">{p.payer_email}</p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {fmtDate(p.created_at)}
                          {p.payment_provider ? ` · ${p.payment_provider}` : ""}
                        </p>
                        {p.transaction_reference && (
                          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                            {p.transaction_reference}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p className="font-semibold">
                          {fmtMoney(p.amount, p.currency || "NGN")}
                        </p>
                        <StatusChip status={p.status} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : subRows.length === 0 ? (
            <div className="py-10 text-center">
              <ReceiptText className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                No transactions found for this subscriber{statusFilter ? ` with status “${statusFilter}”` : ""}.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {subRows.map((t) => (
                  <div key={t.id} className="rounded-xl border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.plan_name || "Subscription charge"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(t.created_at)}</p>
                        {t.reference && (
                          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                            {t.reference}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p className="font-semibold">{fmtMoney(t.amount, t.currency || "NGN")}</p>
                        <StatusChip status={t.status} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading || page <= 1}
                  onClick={() => changePage(page - 1)}
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page}
                  {pagination && pagination.totalPages > 0 ? ` of ${pagination.totalPages}` : ""}
                  {pagination ? ` · ${pagination.total} total` : ""}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading || !pagination || page >= pagination.totalPages}
                  onClick={() => changePage(page + 1)}
                >
                  Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
