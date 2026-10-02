import { useCallback, useEffect, useState } from "react";
import {
  Repeat, Plus, Copy, Check, Trash2, Loader2, Users, TrendingUp, CalendarClock,
  UserPlus, RotateCcw, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useSEO } from "@/lib/use-seo";

interface SubPlan {
  id: string;
  name: string;
  description: string | null;
  amount: string | number;
  currency: string;
  interval: "daily" | "weekly" | "monthly";
  status: "active" | "paused";
  public_id: string;
  active_subscribers: number;
  total_subscribers: number;
  created_at: string;
}

interface Subscriber {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  status: "active" | "past_due" | "cancelled";
  next_charge_date: string | null;
  last_charged_at: string | null;
  plan_name: string;
  plan_amount: string | number;
  plan_interval: string;
  plan_public_id: string;
}

interface Charge {
  id: string;
  reference: string;
  amount: string | number;
  fee: string | number;
  net_amount: string | number;
  currency: string;
  status: string;
  charge_path: string;
  period_start: string;
  customer_name: string;
  plan_name: string;
  created_at: string;
}

interface Stats {
  total_plans: number;
  active_subscribers: number;
  past_due: number;
  estimated_monthly_revenue: string | number;
  total_fees_paid: string | number;
}

const fmtMoney = (v: unknown, currency = "NGN") => {
  const n = Number(v) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const intervalLabel = (i: string) => (i === "daily" ? "day" : i === "weekly" ? "week" : "month");

const subBadge = (status: string) => {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    past_due: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    awaiting_payment: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
    pending: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  };
  return map[status] || map.pending;
};

export default function Recurring() {
  useSEO({
    title: "Subscriptions — Get Paid on Autopilot",
    description:
      "Turn one-off customers into predictable recurring revenue with Metricorex subscription billing.",
    path: "/subscriptions",
    index: false,
  });

  const [tab, setTab] = useState<"plans" | "subscribers" | "charges">("plans");
  const [plans, setPlans] = useState<SubPlan[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [billing, setBilling] = useState<{ enabled: boolean; max_plans: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  // plan form
  const [planOpen, setPlanOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubPlan | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planName, setPlanName] = useState("");
  const [planDesc, setPlanDesc] = useState("");
  const [planAmount, setPlanAmount] = useState("");
  const [planInterval, setPlanInterval] = useState<"daily" | "weekly" | "monthly">("monthly");

  // subscriber form
  const [subOpen, setSubOpen] = useState(false);
  const [subPlanId, setSubPlanId] = useState("");
  const [subName, setSubName] = useState("");
  const [subEmail, setSubEmail] = useState("");
  const [subPhone, setSubPhone] = useState("");
  const [savingSub, setSavingSub] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, s, c] = await Promise.all([
        api.get("/recurring/plans"),
        api.get("/recurring/subscribers"),
        api.get("/recurring/charges"),
      ]);
      setPlans(p.data.plans || []);
      setStats(p.data.stats || null);
      setBilling(p.data.billing || null);
      setSubscribers(s.data.subscribers || []);
      setCharges(c.data.charges || []);
    } catch {
      toast.error("Could not load your subscriptions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const planLink = (publicId: string) => `${window.location.origin}/subscribe/${publicId}`;

  const copyLink = async (publicId: string) => {
    try {
      await navigator.clipboard.writeText(planLink(publicId));
      setCopied(publicId);
      toast.success("Subscribe link copied");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const openCreatePlan = () => {
    setEditingPlan(null);
    setPlanName("");
    setPlanDesc("");
    setPlanAmount("");
    setPlanInterval("monthly");
    setPlanOpen(true);
  };

  const openEditPlan = (p: SubPlan) => {
    setEditingPlan(p);
    setPlanName(p.name);
    setPlanDesc(p.description || "");
    setPlanAmount(String(p.amount));
    setPlanInterval(p.interval);
    setPlanOpen(true);
  };

  const savePlan = async () => {
    if (!planName.trim()) return toast.error("Plan name is required");
    if (!Number(planAmount)) return toast.error("Amount is required");
    setSavingPlan(true);
    try {
      const payload = { name: planName.trim(), description: planDesc.trim() || null, amount: Number(planAmount), interval: planInterval };
      if (editingPlan) {
        await api.put(`/recurring/plans/${editingPlan.id}`, payload);
        toast.success("Plan updated");
      } else {
        await api.post("/recurring/plans", payload);
        toast.success("Subscription plan created");
      }
      setPlanOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not save the plan");
    } finally {
      setSavingPlan(false);
    }
  };

  const togglePlan = async (p: SubPlan) => {
    try {
      await api.put(`/recurring/plans/${p.id}`, { status: p.status === "active" ? "paused" : "active" });
      toast.success(p.status === "active" ? "Plan paused" : "Plan resumed");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not update the plan");
    }
  };

  const deletePlan = async (p: SubPlan) => {
    try {
      await api.delete(`/recurring/plans/${p.id}`);
      toast.success("Plan deleted");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not delete the plan");
    }
  };

  const addSubscriber = async () => {
    if (!subPlanId) return toast.error("Pick a plan");
    if (!subName.trim()) return toast.error("Customer name is required");
    if (!subEmail.trim()) return toast.error("Customer email is required");
    setSavingSub(true);
    try {
      const res = await api.post("/recurring/subscribers", {
        plan_id: subPlanId,
        customer_name: subName.trim(),
        customer_email: subEmail.trim(),
        customer_phone: subPhone.trim() || undefined,
      });
      if (res.data.checkout_url) {
        toast.success("Subscriber added — opening secure checkout for the first cycle");
        window.open(res.data.checkout_url, "_blank");
      } else {
        toast.success(res.data.message || "Subscriber added");
      }
      setSubOpen(false);
      setSubPlanId("");
      setSubName("");
      setSubEmail("");
      setSubPhone("");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not add the subscriber");
    } finally {
      setSavingSub(false);
    }
  };

  const cancelSubscriber = async (s: Subscriber) => {
    try {
      await api.delete(`/recurring/subscribers/${s.id}`);
      toast.success(`${s.customer_name} cancelled`);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not cancel the subscriber");
    }
  };

  const reactivateSubscriber = async (s: Subscriber) => {
    try {
      await api.post(`/recurring/subscribers/${s.id}/reactivate`);
      toast.success(`${s.customer_name} reactivated — next charge runs today`);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not reactivate");
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/15">
              <Repeat className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
              <p className="text-sm text-muted-foreground">
                Recurring billing on your terms — daily, weekly or monthly, charged automatically.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setSubOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add subscriber
            </Button>
            <Button onClick={openCreatePlan}>
              <Plus className="h-4 w-4 mr-2" />
              New plan
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Est. monthly revenue", value: fmtMoney(stats?.estimated_monthly_revenue), icon: TrendingUp },
            { label: "Active subscribers", value: stats?.active_subscribers ?? 0, icon: Users },
            { label: "Past due", value: stats?.past_due ?? 0, icon: CalendarClock },
            { label: "Plans created", value: stats?.total_plans ?? 0, icon: Repeat },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-1 text-lg font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {billing && !billing.enabled && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
            Recurring billing is not available on your current plan. Kindly upgrade your plan.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {(["plans", "subscribers", "charges"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {t === "plans" ? `Plans${stats ? ` (${stats.total_plans})` : ""}` : t === "subscribers" ? `Subscribers (${subscribers.length})` : `Charges (${charges.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "plans" ? (
          plans.length === 0 ? (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <Repeat className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <h3 className="mt-3 font-semibold">No subscription plans yet</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                Create a plan — e.g. "Weekly cleaning service ₦5,000/week" — and share the subscribe link. Charges run automatically on schedule.
              </p>
              <Button className="mt-4" onClick={openCreatePlan}>
                <Plus className="h-4 w-4 mr-2" /> Create your first plan
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((p) => (
                <div key={p.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{p.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {fmtMoney(p.amount, p.currency)} / {intervalLabel(p.interval)}
                      </p>
                    </div>
                    <Badge className={subBadge(p.status)}>{p.status}</Badge>
                  </div>
                  {p.description && <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {p.active_subscribers} active subscriber{p.active_subscribers === 1 ? "" : "s"} · {p.total_subscribers} total
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyLink(p.public_id)}>
                      {copied === p.public_id ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                      Link
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEditPlan(p)}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => togglePlan(p)}>
                      {p.status === "active" ? "Pause" : "Resume"}
                    </Button>
                    {p.total_subscribers === 0 && (
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => deletePlan(p)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === "subscribers" ? (
          subscribers.length === 0 ? (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <h3 className="mt-3 font-semibold">No subscribers yet</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                Share a plan's subscribe link, or add customers yourself. Subscribers with a Metroflow wallet are charged automatically; others get an emailed payment link each cycle.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card divide-y">
              {subscribers.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {s.customer_name}
                      <span className="ml-2 text-xs text-muted-foreground font-normal">{s.customer_email}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.plan_name} · {fmtMoney(s.plan_amount)}/{intervalLabel(s.plan_interval)}
                      {s.next_charge_date && s.status === "active" ? ` · next charge ${new Date(s.next_charge_date).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={subBadge(s.status)}>{s.status.replace("_", " ")}</Badge>
                    {s.status === "past_due" && (
                      <Button size="sm" variant="outline" onClick={() => reactivateSubscriber(s)}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reactivate
                      </Button>
                    )}
                    {s.status !== "cancelled" && (
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => cancelSubscriber(s)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : charges.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <Wallet className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <h3 className="mt-3 font-semibold">No charges yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              Every successful subscription charge shows up here with the platform fee and your net amount.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {charges.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {c.customer_name}
                    <span className="ml-2 text-xs text-muted-foreground font-normal">{c.plan_name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.charge_path === "wallet" ? "Wallet auto-charge" : "Checkout"} · {new Date(c.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="font-semibold">{fmtMoney(c.amount, c.currency)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      net {fmtMoney(c.net_amount, c.currency)} · fee {fmtMoney(c.fee, c.currency)}
                    </p>
                  </div>
                  <Badge className={subBadge(c.status)}>{c.status.replace("_", " ")}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Plan dialog */}
        <Dialog open={planOpen} onOpenChange={setPlanOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPlan ? "Edit plan" : "New subscription plan"}</DialogTitle>
              <DialogDescription>
                Subscribers are charged automatically on the schedule you pick.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sp-name">Plan name</Label>
                <Input id="sp-name" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Weekly cleaning service" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-desc">Description</Label>
                <Textarea id="sp-desc" value={planDesc} onChange={(e) => setPlanDesc(e.target.value)} rows={2} placeholder="What's included?" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sp-amount">Amount per cycle (₦)</Label>
                  <Input id="sp-amount" type="number" min={100} value={planAmount} onChange={(e) => setPlanAmount(e.target.value)} placeholder="5000" />
                </div>
                <div className="space-y-1.5">
                  <Label>Charge every</Label>
                  <div className="flex gap-1.5">
                    {(["daily", "weekly", "monthly"] as const).map((iv) => (
                      <button
                        key={iv}
                        type="button"
                        onClick={() => setPlanInterval(iv)}
                        className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium capitalize transition-colors ${
                          planInterval === iv ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {iv}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancel</Button>
              <Button onClick={savePlan} disabled={savingPlan}>
                {savingPlan && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingPlan ? "Save changes" : "Create plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add subscriber dialog */}
        <Dialog open={subOpen} onOpenChange={setSubOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add subscriber</DialogTitle>
              <DialogDescription>
                If the customer uses Metricorex, their wallet is charged automatically. Otherwise they get a secure payment link by email each cycle.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <select
                  value={subPlanId}
                  onChange={(e) => setSubPlanId(e.target.value)}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Pick a plan…</option>
                  {plans.filter((p) => p.status === "active").map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {fmtMoney(p.amount)}/{intervalLabel(p.interval)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-name">Customer name</Label>
                <Input id="su-name" value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Ada Obi" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-email">Customer email</Label>
                <Input id="su-email" type="email" value={subEmail} onChange={(e) => setSubEmail(e.target.value)} placeholder="ada@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-phone">Phone (optional)</Label>
                <Input id="su-phone" value={subPhone} onChange={(e) => setSubPhone(e.target.value)} placeholder="0803..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubOpen(false)}>Cancel</Button>
              <Button onClick={addSubscriber} disabled={savingSub}>
                {savingSub && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add subscriber
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
