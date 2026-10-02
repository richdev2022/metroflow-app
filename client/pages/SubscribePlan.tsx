import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useSEO } from "@/lib/use-seo";

interface PublicPlan {
  id: string;
  public_id: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: string;
}

const fmtMoney = (v: unknown, currency = "NGN") => {
  const n = Number(v) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const intervalLabel = (i: string) => (i === "daily" ? "day" : i === "weekly" ? "week" : "month");

export default function SubscribePlan() {
  useSEO({ title: "Subscribe", description: "Subscribe to a plan.", index: false });

  const { publicId } = useParams();
  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!publicId) return;
    api
      .get(`/recurring/public/plans/${publicId}`)
      .then((res) => {
        setPlan(res.data.plan);
        setBusinessName(res.data.business_name || "");
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [publicId]);

  const subscribe = async () => {
    if (!name.trim()) return toast.error("Your name is required");
    if (!email.trim()) return toast.error("Your email is required");
    setSubscribing(true);
    try {
      const res = await api.post(`/recurring/public/plans/${publicId}/subscribe`, {
        customer_name: name.trim(),
        customer_email: email.trim(),
        customer_phone: phone.trim() || undefined,
      });
      if (res.data.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setDone(res.data.message || "Subscription active");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not subscribe");
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !plan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <Repeat className="h-12 w-12 text-muted-foreground/40" />
        <h1 className="text-xl font-bold">Plan not found</h1>
        <p className="text-sm text-muted-foreground">This subscription link is invalid or no longer active.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 py-14">
        <div className="rounded-2xl border bg-card p-6 sm:p-8 shadow-sm">
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
              <h1 className="mt-3 text-xl font-bold">You're subscribed</h1>
              <p className="mt-1 text-sm text-muted-foreground">{done}</p>
            </div>
          ) : (
            <>
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  {businessName}
                </p>
                <h1 className="mt-1 text-xl font-bold">{plan.name}</h1>
                {plan.description && <p className="mt-1.5 text-sm text-muted-foreground">{plan.description}</p>}
                <p className="mt-4 text-3xl font-bold">
                  {fmtMoney(plan.amount, plan.currency)}
                  <span className="text-sm font-normal text-muted-foreground"> / {intervalLabel(plan.interval)}</span>
                </p>
              </div>

              <div className="mt-6 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="s-name">Your name</Label>
                  <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Obi" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-email">Email</Label>
                  <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-phone">Phone (optional)</Label>
                  <Input id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803..." />
                </div>
              </div>

              <Button className="w-full mt-5" onClick={subscribe} disabled={subscribing}>
                {subscribing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Subscribe — {fmtMoney(plan.amount, plan.currency)}/{intervalLabel(plan.interval)}
              </Button>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                If you use Metricorex, charges come straight from your wallet. Otherwise you'll get a secure payment link every {intervalLabel(plan.interval)} by email. You can unsubscribe anytime.
              </p>
            </>
          )}

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Repeat className="h-3.5 w-3.5" />
            Powered by{" "}
            <a href="/" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              Metricorex
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
