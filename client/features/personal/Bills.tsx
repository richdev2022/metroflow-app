import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, Smartphone, Wifi, Tv, Zap, Dice5, Search, ShieldCheck, BadgeCheck, Clock, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useSEO } from "@/lib/use-seo";
import { cn } from "@/lib/utils";
import type { WalletInfo } from "@shared/api";
import PinInput from "@/components/PinInput";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillPlan {
  code: string;
  name: string;
  amount: number;
  validity?: string;
}

interface BillProvider {
  code: string;
  name: string;
  category: string;
  refLabel: string;
  refPattern?: string;
  refExample?: string;
  plans?: BillPlan[];
}

interface CatalogResponse {
  success: boolean;
  liveProvider: boolean;
  categories: string[];
  providers: BillProvider[];
}

interface BillPayment {
  id: string;
  reference: string;
  category: string;
  provider_name: string | null;
  plan_name: string | null;
  customer_ref: string;
  amount: string | number;
  fee: string | number;
  total: string | number;
  currency: string;
  status: string;
  fulfilment_mode: string | null;
  created_at: string;
}

interface BillStats {
  total_count: number;
  total_spent: string | number;
  total_fees: string | number;
}

interface WalletLite {
  id: string;
  balance: string | number;
  currency: string;
  business_id?: string | null;
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Smartphone; blurb: string }> = {
  airtime: { label: "Airtime", icon: Smartphone, blurb: "Top up any network in seconds" },
  data: { label: "Data", icon: Wifi, blurb: "Browse all day with data bundles" },
  tv: { label: "TV", icon: Tv, blurb: "DStv, GOtv & StarTimes subscriptions" },
  electricity: { label: "Electricity", icon: Zap, blurb: "Prepaid tokens for every Disco" },
  betting: { label: "Betting", icon: Dice5, blurb: "Fund your betting wallets instantly" },
};

const fmtMoney = (v: unknown, currency = "NGN") => {
  const n = Number(v) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function statusMeta(status: string): { label: string; className: string } {
  if (status === "success") return { label: "Successful", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  if (status === "failed") return { label: "Failed", className: "bg-red-500/10 text-red-600 dark:text-red-400" };
  return { label: "Pending", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Bills() {
  useSEO({
    title: "Bills — Airtime, Data, TV, Electricity & Betting | Metricorex",
    description:
      "Pay airtime, data bundles, TV subscriptions, electricity tokens and betting top-ups from your Metricorex wallet — instant, secure and on every plan.",
    path: "/bills",
    index: false,
  });

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState<BillPayment[]>([]);
  const [stats, setStats] = useState<BillStats | null>(null);
  const [category, setCategory] = useState<string>("airtime");
  const [search, setSearch] = useState("");

  // Buy dialog state
  const [buyProvider, setBuyProvider] = useState<BillProvider | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [planCode, setPlanCode] = useState("");
  const [amount, setAmount] = useState("");
  const [customerRef, setCustomerRef] = useState("");
  const [walletId, setWalletId] = useState("");
  const [pin, setPin] = useState("");
  const [paying, setPaying] = useState(false);

  const [wallets, setWallets] = useState<WalletLite[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get("/bills");
      if (res.data?.success) {
        setBills(res.data.bills || []);
        setStats(res.data.stats || null);
      }
    } catch {
      /* history is non-fatal */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [catalogRes, walletRes] = await Promise.all([
          api.get("/bills/catalog"),
          api.get<WalletInfo>("/wallet"),
        ]);
        if (!alive) return;
        if (catalogRes.data?.success) setCatalog(catalogRes.data);
        const ws: WalletLite[] = [];
        if (walletRes.data?.user_wallet) ws.push(walletRes.data.user_wallet);
        if (walletRes.data?.business_wallet) ws.push(walletRes.data.business_wallet);
        setWallets(ws);
        if (ws.length > 0) setWalletId(ws[0].id);
        await loadHistory();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadHistory]);

  const providers = useMemo(() => {
    if (!catalog) return [];
    return catalog.providers
      .filter((p) => p.category === category)
      .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, category, search]);

  const selectedPlan = buyProvider?.plans?.find((p) => p.code === planCode) || null;
  const amountDue = selectedPlan ? selectedPlan.amount : Number(amount) || 0;
  const estimatedFee = 50; // standard convenience fee — actual fee (plan discount) is returned by the API
  const totalDue = amountDue + (amountDue > 0 ? estimatedFee : 0);

  const openBuy = (provider: BillProvider) => {
    setBuyProvider(provider);
    setPlanCode(provider.plans?.[0]?.code || "");
    setAmount("");
    setCustomerRef("");
    setPin("");
    setBuyOpen(true);
  };

  const submitBuy = async () => {
    if (!buyProvider) return;
    if (!customerRef.trim()) {
      toast.error(`${buyProvider.refLabel} is required`);
      return;
    }
    if (!buyProvider.plans?.length && (!amount || Number(amount) <= 0)) {
      toast.error("Enter an amount");
      return;
    }
    if (!walletId) {
      toast.error("Choose a wallet to pay from");
      return;
    }
    if (!pin || pin.length !== 4) {
      toast.error("Enter your 4-digit transaction PIN");
      return;
    }
    setPaying(true);
    try {
      const res = await api.post("/bills/pay", {
        category: buyProvider.category,
        provider_code: buyProvider.code,
        plan_code: planCode || undefined,
        customer_ref: customerRef.trim(),
        wallet_id: walletId,
        amount: buyProvider.plans?.length ? undefined : Number(amount),
        pin,
      });
      if (res.data?.success) {
        toast.success(res.data.message || "Bill payment successful");
        setBuyOpen(false);
        await loadHistory();
      } else {
        toast.error(res.data?.error || "Bill payment failed");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Bill payment failed");
    } finally {
      setPaying(false);
    }
  };

  const selectedWallet = wallets.find((w) => w.id === walletId);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" /> Bills
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Airtime, data, TV, electricity and betting — paid instantly from your wallet.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-xl border bg-card px-4 py-2 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total paid</p>
              <p className="text-sm font-bold">{fmtMoney(stats?.total_spent ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-card px-4 py-2 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bills</p>
              <p className="text-sm font-bold">{stats?.total_count ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Catalog */}
        <div className="rounded-2xl border bg-card p-4 md:p-6 space-y-4">
          <Tabs value={category} onValueChange={setCategory}>
            <TabsList className="flex flex-wrap h-auto gap-1">
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <TabsTrigger key={key} value={key} className="gap-1.5">
                  <meta.icon className="h-4 w-4" />
                  {meta.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">{CATEGORY_META[category]?.blurb}</p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search services…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading services…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {providers.map((provider) => (
                <button
                  key={provider.code}
                  onClick={() => openBuy(provider)}
                  className="group rounded-xl border bg-background p-4 text-left transition hover:border-primary hover:shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {(() => {
                        const Icon = CATEGORY_META[provider.category]?.icon || Smartphone;
                        return <Icon className="h-4.5 w-4.5" />;
                      })()}
                    </span>
                    <span className="text-sm font-semibold leading-tight">{provider.name}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {provider.plans?.length ? `${provider.plans.length} packages` : provider.refLabel}
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100">
                    Pay now →
                  </span>
                </button>
              ))}
              {providers.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  No services match your search.
                </p>
              )}
            </div>
          )}
        </div>

        {/* History */}
        <div className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" /> Recent bills
            </h2>
            <Button variant="ghost" size="sm" onClick={loadHistory}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {bills.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No bill payments yet — buy airtime or data above to get started.
            </p>
          ) : (
            <div className="divide-y">
              {bills.map((bill) => {
                const meta = statusMeta(bill.status);
                return (
                  <div key={bill.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      {(() => {
                        const Icon = CATEGORY_META[bill.category]?.icon || Smartphone;
                        return <Icon className="h-4 w-4 text-muted-foreground" />;
                      })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {bill.provider_name}
                        {bill.plan_name ? ` · ${bill.plan_name}` : ""} — {bill.customer_ref}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(bill.created_at)} · ref {bill.reference}
                        {bill.fulfilment_mode === "simulated" ? " · sandbox" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{fmtMoney(bill.total, bill.currency)}</p>
                      <Badge variant="secondary" className={cn("mt-0.5", meta.className)}>
                        {meta.label}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Buy dialog */}
      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-primary" />
              {buyProvider?.name}
            </DialogTitle>
            <DialogDescription>
              {buyProvider?.plans?.length
                ? "Pick a package and confirm the payment."
                : `Enter the amount and the ${buyProvider?.refLabel?.toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {buyProvider?.plans?.length ? (
              <div className="space-y-1.5">
                <Label>Package</Label>
                <Select value={planCode} onValueChange={setPlanCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a package" />
                  </SelectTrigger>
                  <SelectContent>
                    {buyProvider.plans.map((plan) => (
                      <SelectItem key={plan.code} value={plan.code}>
                        {plan.name} — {fmtMoney(plan.amount)}
                        {plan.validity ? ` (${plan.validity})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Amount (₦50 – ₦500,000)</Label>
                <Input
                  type="number"
                  min={50}
                  max={500000}
                  placeholder="e.g. 1000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{buyProvider?.refLabel}</Label>
              <Input
                placeholder={buyProvider?.refExample || ""}
                value={customerRef}
                onChange={(e) => setCustomerRef(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Pay from</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose wallet" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.business_id ? "Business" : "Personal"} wallet — {fmtMoney(w.balance, w.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedWallet && Number(selectedWallet.balance) < totalDue && (
                <p className="text-xs text-red-500">
                  Balance is short of {fmtMoney(totalDue)} — fund this wallet first.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Transaction PIN
              </Label>
              <PinInput value={pin} onChange={setPin} />
            </div>

            {amountDue > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Amount</span>
                  <span>{fmtMoney(amountDue)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Convenience fee</span>
                  <span>≈ {fmtMoney(estimatedFee)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total</span>
                  <span>≈ {fmtMoney(totalDue)}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyOpen(false)} disabled={paying}>
              Cancel
            </Button>
            <Button onClick={submitBuy} disabled={paying} className="gap-2">
              {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {paying ? "Paying…" : "Pay bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
