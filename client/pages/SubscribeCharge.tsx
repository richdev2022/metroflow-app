import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Repeat, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useSEO } from "@/lib/use-seo";

interface Charge {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  period_start: string;
  period_end: string | null;
  customer_name: string;
  customer_email: string;
  plan_name: string;
  interval: string;
  business_name: string;
}

const fmtMoney = (v: unknown, currency = "NGN") => {
  const n = Number(v) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function SubscribeCharge() {
  useSEO({ title: "Subscription Payment", description: "Pay your subscription due.", index: false });

  const { reference } = useParams();
  const [charge, setCharge] = useState<Charge | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!reference) return;
    let tries = 0;
    const load = async () => {
      try {
        const res = await api.get(`/recurring/public/charges/${reference}`);
        setCharge(res.data.charge);
        setLoading(false);
        if (res.data.charge?.status === "success") return;
        // Refresh briefly after payment — the webhook flips the status
        if (tries < 24) {
          tries += 1;
          setTimeout(load, 5000);
        }
      } catch {
        setNotFound(true);
        setLoading(false);
      }
    };
    load();
  }, [reference]);

  const pay = async () => {
    setPaying(true);
    try {
      const res = await api.post(`/recurring/public/charges/${reference}/pay`, {});
      window.location.href = res.data.checkout_url;
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not start the payment");
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !charge) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <XCircle className="h-12 w-12 text-muted-foreground/40" />
        <h1 className="text-xl font-bold">Payment not found</h1>
        <p className="text-sm text-muted-foreground">This payment link is invalid or has expired.</p>
      </div>
    );
  }

  const paid = charge.status === "success";

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 py-14">
        <div className="rounded-2xl border bg-card p-6 sm:p-8 shadow-sm">
          <div className="text-center">
            {paid ? (
              <>
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
                <h1 className="mt-3 text-xl font-bold">Payment received</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your {charge.plan_name} subscription is active. Thank you!
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto h-14 w-14 rounded-2xl bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center">
                  <Repeat className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  {charge.business_name}
                </p>
                <h1 className="mt-1 text-xl font-bold">{charge.plan_name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {charge.interval} subscription · {charge.customer_name}
                </p>
                <p className="mt-4 text-3xl font-bold">{fmtMoney(charge.amount, charge.currency)}</p>
                {charge.period_end && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Covers {new Date(charge.period_start).toLocaleDateString()}
                    {charge.period_end ? ` – ${new Date(charge.period_end).toLocaleDateString()}` : ""}
                  </p>
                )}
              </>
            )}
          </div>

          {!paid && (
            <>
              <Button className="w-full mt-6" onClick={pay} disabled={paying}>
                {paying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Pay {fmtMoney(charge.amount, charge.currency)} securely
              </Button>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Paid with your card or bank through a secure checkout. You can unsubscribe anytime from the link in your emails.
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
