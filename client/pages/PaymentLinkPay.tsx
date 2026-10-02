import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, ShieldCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSEO } from "@/lib/use-seo";
import { api } from "@/lib/api-client";

interface LinkInfo {
  slug: string;
  title: string;
  description: string | null;
  amount: number | null;
  currency: string;
  allow_custom_amount: boolean;
}

const symbolFor = (currency: string) =>
  currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";

/**
 * PUBLIC customer-facing checkout for a business's payment link.
 * /pay/:slug — no authentication required. Loads the link info, collects the
 * payer's name/email (+ amount for open links), then hands off to the active
 * payment provider's hosted checkout. The backend webhook settles the payment
 * into the merchant's wallet.
 */
export default function PaymentLinkPay() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [businessName, setBusinessName] = useState("");

  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [starting, setStarting] = useState(false);

  useSEO({
    title: link ? `Pay ${link.title}` : "Secure Payment",
    description: link
      ? `Complete your payment to ${businessName || "the merchant"} for "${link.title}" via Metricorex.`
      : "Complete your payment securely via Metricorex.",
    path: `/pay/${slug || ""}`,
    index: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/payment-links/public/${slug}`);
        const data = res?.data || {};
        if (cancelled) return;
        if (!data?.success) {
          setError(data?.error || "This payment link is not available.");
        } else {
          setLink(data.link);
          setBusinessName(data.business_name || "");
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(msg || "Could not load this payment link. Please check the link and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const startPayment = async () => {
    if (!link) return;
    const chosenAmount = link.allow_custom_amount ? Number(amount) : link.amount;
    if (!chosenAmount || chosenAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    if (!payerEmail.trim()) {
      setError("Your email is required for the receipt.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const res = await api.post(`/payment-links/public/${slug}/initiate`, {
        amount: chosenAmount,
        payer_name: payerName.trim() || undefined,
        payer_email: payerEmail.trim(),
      });
      const data = res?.data || {};
      if (!data?.success || !data?.checkout_url) {
        setError(data?.error || "Could not start the payment. Please try again.");
        return;
      }
      window.location.href = data.checkout_url as string;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Network error — please try again.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <span className="text-lg font-bold tracking-tight">Metricorex</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Secure checkout
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-10">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : !link ? (
          <div className="mt-16 rounded-2xl border border-dashed p-10 text-center">
            <h1 className="text-lg font-semibold">Payment link unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Link to="/login" className="mt-6 inline-block text-sm text-primary hover:underline">
              Go to Metricorex
            </Link>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Payment to {businessName || "merchant"}
              </p>
              <h1 className="mt-1 text-xl font-bold">{link.title}</h1>
              {link.description && (
                <p className="mt-2 text-sm text-muted-foreground">{link.description}</p>
              )}

              <div className="mt-5 text-3xl font-bold tracking-tight">
                {link.allow_custom_amount ? (
                  <span className="text-lg font-medium text-muted-foreground">
                    Enter the amount you'd like to pay
                  </span>
                ) : (
                  <>
                    {symbolFor(link.currency)}
                    {Number(link.amount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
              <div className="space-y-1.5">
                <Label htmlFor="pay-name">Your name</Label>
                <Input
                  id="pay-name"
                  placeholder="e.g. Ada Obi"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-email">Email (for your receipt)</Label>
                <Input
                  id="pay-email"
                  type="email"
                  placeholder="you@example.com"
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                />
              </div>
              {link.allow_custom_amount && (
                <div className="space-y-1.5">
                  <Label htmlFor="pay-amount">Amount ({symbolFor(link.currency)})</Label>
                  <Input
                    id="pay-amount"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="e.g. 10000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              )}

              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              )}

              <Button className="w-full" size="lg" onClick={startPayment} disabled={starting}>
                {starting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
                {starting ? "Starting secure payment…" : "Pay now"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                You'll be redirected to our secure payment provider to complete this payment.
              </p>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Powered by Metricorex Payments
      </footer>
    </div>
  );
}
