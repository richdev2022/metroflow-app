import { useCallback, useEffect, useState } from "react";
import {
  Loader2, PiggyBank, Plus, Target, CalendarClock, RefreshCcw, Trash2, Wallet, Pause, Play, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SavingsVault {
  id: string;
  name: string;
  currency: string;
  balance: string | number;
  goal_amount: string | number | null;
  target_date: string | null;
  status: string; // active | paused | closed
  auto_save_enabled: boolean;
  auto_save_amount: string | number | null;
  auto_save_frequency: string | null; // daily | weekly | monthly
  auto_save_next_run: string | null;
  total_deposited: string | number;
  total_withdrawn: string | number;
  deposit_count?: number;
  created_at: string;
}

interface VaultStats {
  total_vaults: number;
  total_saved: string | number;
  active_auto_saves: number;
}

interface WalletLite {
  id: string;
  balance: string | number;
  currency: string;
  business_id?: string | null;
}

const fmtMoney = (v: unknown, currency = "NGN") => {
  const n = Number(v) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;

const FREQ_LABEL: Record<string, string> = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};

const progressOf = (vault: SavingsVault) => {
  const goal = Number(vault.goal_amount) || 0;
  const balance = Number(vault.balance) || 0;
  if (goal <= 0) return null;
  return Math.min(100, Math.round((balance / goal) * 100));
};

const isEarlyBreak = (vault: SavingsVault) =>
  !!vault.target_date && new Date(vault.target_date) > new Date(new Date().toDateString());

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Savings() {
  useSEO({
    title: "Savings Vaults — Save Daily, Reach Your Goals | Metricorex",
    description:
      "Create goal-based savings vaults with daily, weekly or monthly auto-save from your Metricorex wallet. Withdraw anytime — keep every kobo after your target date.",
    path: "/savings",
    index: false,
  });

  const [vaults, setVaults] = useState<SavingsVault[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [wallets, setWallets] = useState<WalletLite[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    goal_amount: "",
    target_date: "",
    auto_save_enabled: false,
    auto_save_amount: "",
    auto_save_frequency: "daily",
    auto_save_wallet_id: "",
  });
  const [creating, setCreating] = useState(false);

  // Money dialogs
  const [moneyVault, setMoneyVault] = useState<SavingsVault | null>(null);
  const [moneyMode, setMoneyMode] = useState<"deposit" | "withdraw">("deposit");
  const [moneyAmount, setMoneyAmount] = useState("");
  const [moneyWalletId, setMoneyWalletId] = useState("");
  const [moneyBusy, setMoneyBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/savings/vaults");
      if (res.data?.success) {
        setVaults(res.data.vaults || []);
        setStats(res.data.stats || null);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const walletRes = await api.get<WalletInfo>("/wallet");
        if (!alive) return;
        const ws: WalletLite[] = [];
        if (walletRes.data?.user_wallet) ws.push(walletRes.data.user_wallet);
        if (walletRes.data?.business_wallet) ws.push(walletRes.data.business_wallet);
        setWallets(ws);
        if (ws.length > 0) {
          setMoneyWalletId(ws[0].id);
          setForm((f) => ({ ...f, auto_save_wallet_id: ws[0].id }));
        }
        await load();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  // ----- Create -----
  const submitCreate = async () => {
    if (!form.name.trim()) {
      toast.error("Give your vault a name");
      return;
    }
    setCreating(true);
    try {
      const res = await api.post("/savings/vaults", {
        name: form.name.trim(),
        goal_amount: form.goal_amount ? Number(form.goal_amount) : null,
        target_date: form.target_date || null,
        auto_save_enabled: form.auto_save_enabled,
        auto_save_amount: form.auto_save_enabled && form.auto_save_amount ? Number(form.auto_save_amount) : undefined,
        auto_save_frequency: form.auto_save_enabled ? form.auto_save_frequency : undefined,
        auto_save_wallet_id: form.auto_save_enabled ? form.auto_save_wallet_id : undefined,
      });
      if (res.data?.success) {
        toast.success(`Vault "${res.data.vault.name}" created`);
        setCreateOpen(false);
        setForm({
          name: "",
          goal_amount: "",
          target_date: "",
          auto_save_enabled: false,
          auto_save_amount: "",
          auto_save_frequency: "daily",
          auto_save_wallet_id: wallets[0]?.id || "",
        });
        await load();
      } else {
        toast.error(res.data?.error || "Could not create the vault");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not create the vault");
    } finally {
      setCreating(false);
    }
  };

  // ----- Deposit / withdraw -----
  const openMoney = (vault: SavingsVault, mode: "deposit" | "withdraw") => {
    setMoneyVault(vault);
    setMoneyMode(mode);
    setMoneyAmount("");
    setMoneyWalletId(wallets[0]?.id || "");
  };

  const submitMoney = async () => {
    if (!moneyVault) return;
    const amount = Number(moneyAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!moneyWalletId) {
      toast.error("Choose a wallet");
      return;
    }
    setMoneyBusy(true);
    try {
      const path = moneyMode === "deposit" ? "deposit" : "withdraw";
      const res = await api.post(`/savings/vaults/${moneyVault.id}/${path}`, {
        amount,
        wallet_id: moneyWalletId,
      });
      if (res.data?.success) {
        toast.success(
          moneyMode === "deposit"
            ? `Added ${fmtMoney(amount)} to "${moneyVault.name}"`
            : `Withdrew ${fmtMoney(res.data.payout ?? amount)}${res.data.fee ? ` (fee: ${fmtMoney(res.data.fee)})` : ""}`,
        );
        setMoneyVault(null);
        await load();
      } else {
        toast.error(res.data?.error || "Transaction failed");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Transaction failed");
    } finally {
      setMoneyBusy(false);
    }
  };

  // ----- Pause / resume / delete -----
  const togglePause = async (vault: SavingsVault) => {
    try {
      const nextStatus = vault.status === "paused" ? "active" : "paused";
      const res = await api.put(`/savings/vaults/${vault.id}`, { status: nextStatus });
      if (res.data?.success) {
        toast.success(nextStatus === "paused" ? "Vault paused" : "Vault resumed");
        await load();
      } else {
        toast.error(res.data?.error || "Update failed");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Update failed");
    }
  };

  const deleteVault = async (vault: SavingsVault) => {
    if (!window.confirm(`Delete "${vault.name}"? This cannot be undone.`)) return;
    try {
      const res = await api.delete(`/savings/vaults/${vault.id}`);
      if (res.data?.success) {
        toast.success("Vault deleted");
        await load();
      } else {
        toast.error(res.data?.error || "Delete failed");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Delete failed");
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PiggyBank className="h-6 w-6 text-primary" /> Savings Vaults
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Set a goal, auto-save daily and watch it grow. Withdraw anytime.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New vault
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total saved</p>
            <p className="mt-1 text-lg font-bold">{fmtMoney(stats?.total_saved ?? 0)}</p>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Vaults</p>
            <p className="mt-1 text-lg font-bold">{stats?.total_vaults ?? 0}</p>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Auto-saves on</p>
            <p className="mt-1 text-lg font-bold">{stats?.active_auto_saves ?? 0}</p>
          </div>
        </div>

        {/* Vaults */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading vaults…
          </div>
        ) : vaults.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
            <Target className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">No vaults yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first vault — save towards rent, equipment or that next big move.
            </p>
            <Button className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create a vault
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {vaults.map((vault) => {
              const progress = progressOf(vault);
              const early = isEarlyBreak(vault);
              return (
                <div key={vault.id} className="rounded-2xl border bg-card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold leading-tight">{vault.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {vault.goal_amount
                          ? `Goal ${fmtMoney(vault.goal_amount, vault.currency)}`
                          : "Flexible savings"}
                        {vault.target_date ? ` · by ${fmtDate(vault.target_date)}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        vault.status === "active"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {vault.status === "active" ? "Active" : vault.status === "paused" ? "Paused" : "Closed"}
                    </Badge>
                  </div>

                  <div>
                    <p className="text-2xl font-bold">{fmtMoney(vault.balance, vault.currency)}</p>
                    {progress != null && (
                      <div className="mt-2">
                        <Progress value={progress} />
                        <p className="mt-1 text-xs text-muted-foreground">{progress}% of goal</p>
                      </div>
                    )}
                  </div>

                  {vault.auto_save_enabled && (
                    <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs">
                      <RefreshCcw className="h-3.5 w-3.5 text-primary" />
                      <span>
                        Auto-save {fmtMoney(vault.auto_save_amount ?? 0)} {FREQ_LABEL[vault.auto_save_frequency || ""]?.toLowerCase() || vault.auto_save_frequency}
                        {vault.auto_save_next_run && vault.status === "active"
                          ? ` · next ${fmtDate(vault.auto_save_next_run)}`
                          : ""}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="gap-1.5" onClick={() => openMoney(vault, "deposit")}>
                      <Plus className="h-3.5 w-3.5" /> Deposit
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openMoney(vault, "withdraw")}>
                      <Wallet className="h-3.5 w-3.5" /> Withdraw
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      onClick={() => togglePause(vault)}
                      title={vault.status === "paused" ? "Resume vault" : "Pause auto-save & vault"}
                    >
                      {vault.status === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-red-500 hover:text-red-600"
                      onClick={() => deleteVault(vault)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {early && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      Withdrawing before {fmtDate(vault.target_date)} attracts a small early-break fee (2%, max ₦5,000 — lower on paid plans).
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-2xl border border-dashed p-4 text-xs text-muted-foreground">
          <TrendingUp className="h-4 w-4 shrink-0" />
          Money in vaults is moved with double-entry ledger entries — deposits debit your wallet instantly, withdrawals credit it back (minus any break fee).
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New savings vault</DialogTitle>
            <DialogDescription>Set a goal, a target date and (optionally) auto-save.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Vault name</Label>
              <Input
                placeholder="e.g. New shop rent"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Goal amount (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="500000"
                  value={form.goal_amount}
                  onChange={(e) => setForm({ ...form, goal_amount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Target date</Label>
                <Input
                  type="date"
                  value={form.target_date}
                  onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                />
              </div>
            </div>
            <div className="rounded-xl border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto-save</p>
                  <p className="text-xs text-muted-foreground">Move money automatically</p>
                </div>
                <Switch
                  checked={form.auto_save_enabled}
                  onCheckedChange={(v) => setForm({ ...form, auto_save_enabled: v })}
                />
              </div>
              {form.auto_save_enabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      min={100}
                      placeholder="1000"
                      value={form.auto_save_amount}
                      onChange={(e) => setForm({ ...form, auto_save_amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Frequency</Label>
                    <Select
                      value={form.auto_save_frequency}
                      onValueChange={(v) => setForm({ ...form, auto_save_frequency: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>From wallet</Label>
                    <Select
                      value={form.auto_save_wallet_id}
                      onValueChange={(v) => setForm({ ...form, auto_save_wallet_id: v })}
                    >
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
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={creating} className="gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {creating ? "Creating…" : "Create vault"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deposit / withdraw dialog */}
      <Dialog
        open={!!moneyVault}
        onOpenChange={(open) => {
          if (!open) setMoneyVault(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {moneyMode === "deposit" ? "Deposit into" : "Withdraw from"} {moneyVault?.name}
            </DialogTitle>
            <DialogDescription>
              {moneyMode === "deposit"
                ? "Move money from a wallet into this vault."
                : isEarlyBreak(moneyVault as SavingsVault)
                  ? "This vault hasn't reached its target date — an early-break fee applies."
                  : "Money returns to your wallet in full — no fees."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                min={0}
                placeholder="5000"
                value={moneyAmount}
                onChange={(e) => setMoneyAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{moneyMode === "deposit" ? "From wallet" : "To wallet"}</Label>
              <Select value={moneyWalletId} onValueChange={setMoneyWalletId}>
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
            </div>
            {moneyVault && (
              <p className="text-xs text-muted-foreground">
                Vault balance: {fmtMoney(moneyVault.balance, moneyVault.currency)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoneyVault(null)} disabled={moneyBusy}>
              Cancel
            </Button>
            <Button onClick={submitMoney} disabled={moneyBusy} className="gap-2">
              {moneyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {moneyBusy ? "Working…" : moneyMode === "deposit" ? "Deposit" : "Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
