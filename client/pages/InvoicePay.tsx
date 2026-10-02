import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, ShieldCheck, Lock, CalendarDays, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useSEO } from "@/lib/use-seo";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface InvoiceInfo {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  tax_percent: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  currency: string;
  amount_paid: number;
}

const symbolFor = (currency: string) =>
  currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";

const fmtMoney = (v: number, currency: string) =>
  `${symbolFor(currency)}${Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * PUBLIC client-facing checkout for a business invoice.
 * /invoices/:id/pay — no authentication required. Shows the itemised invoice
 * (line items, tax, total, due date), collects the payer's email, then hands
 * off to the active payment provider's hosted checkout. The backend webhook
 * settles the payment into the merchant's wallet and marks the invoice paid.
 */
export default function InvoicePay() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [businessName, setBusinessName] = useState("");

  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [starting, setStarting] = useState(false);

  useSEO({
    title: invoice ? `Invoice ${invoice.invoice_number}` : "Secure Invoice Payment",
    description: invoice
      ? `Pay invoice ${invoice.invoice_number} from ${businessName || "the merchant"} securely via Metricorex.`
      : "Complete your invoice payment securely via Metricorex.",
    path: `/invoices/${id || ""}/pay`,
    index: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/invoices/public/${id}`);
        const data = res?.data || {};
        if (cancelled) return;
        if (!data?.success) {
          setError(data?.error || "This invoice is not available.");
        } else {
          setInvoice(data.invoice);
          setItems(data.items || []);
          setBusinessName(data.business_name || "");
          if (data.invoice?.client_email) setPayerEmail(data.invoice.client_email);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(msg || "Could not load this invoice. Please check the link and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const startPayment = async () => {
    if (!invoice) return;
    if (!payerEmail.trim()) {
      setError("Your email is required for the receipt.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const res = await api.post(`/invoices/public/${invoice.id}/initiate`, {
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

  const isPaid = invoice?.status === "paid";
  const isOverdue = invoice?.status === "overdue";

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
        ) : !invoice ? (
          <div className="mt-16 rounded-2xl border border-dashed p-10 text-center">
            <h1 className="text-lg font-semibold">Invoice unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Link to="/login" className="mt-6 inline-block text-sm text-primary hover:underline">
              Go to Metricorex
            </Link>
          </div>
        ) : (
          <>
            {/* Invoice header card */}
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Invoice from {businessName || "merchant"}
                  </p>
                  <h1 className="mt-1 flex items-center gap-2 text-xl font-bold">
                    <FileText className="h-5 w-5 text-primary" />
                    {invoice.invoice_number}
                  </h1>
                </div>
                <Badge
                  className={cn(
                    "shrink-0",
                    isPaid && "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10",
                    isOverdue && "bg-red-500/10 text-red-600 hover:bg-red-500/10",
                    !isPaid && !isOverdue && "bg-amber-500/10 text-amber-600 hover:bg-amber-500/10",
                  )}
                >
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </Badge>
              </div>

              <p className="mt-2 text-sm text-muted-foreground">
                Billed to <span className="font-medium text-foreground">{invoice.client_name}</span>
                {invoice.client_email ? ` · ${invoice.client_email}` : ""}
              </p>
              {invoice.due_date && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Due {new Date(invoice.due_date).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>

            {/* Line items */}
            <div className="mt-4 rounded-2xl border bg-card p-6 shadow-sm">
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} × {fmtMoney(item.unit_price, invoice.currency)}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium">
                      {fmtMoney(item.amount, invoice.currency)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-1.5 border-t pt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{fmtMoney(invoice.subtotal, invoice.currency)}</span>
                </div>
                {invoice.tax_percent > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax / VAT ({invoice.tax_percent}%)</span>
                    <span>{fmtMoney(invoice.tax_amount, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{fmtMoney(invoice.total, invoice.currency)}</span>
                </div>
              </div>

              {invoice.notes && (
                <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {invoice.notes}
                </p>
              )}
            </div>

            {/* Payment box */}
            <div className="mt-6 space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
              {isPaid ? (
                <div className="rounded-lg bg-emerald-500/10 px-4 py-3 text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  This invoice has already been paid. Thank you!
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-pay-name">Your name</Label>
                    <Input
                      id="inv-pay-name"
                      placeholder="e.g. Ada Obi"
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-pay-email">Email (for your receipt)</Label>
                    <Input
                      id="inv-pay-email"
                      type="email"
                      placeholder="you@example.com"
                      value={payerEmail}
                      onChange={(e) => setPayerEmail(e.target.value)}
                    />
                  </div>

                  {error && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                  )}

                  <Button className="w-full" size="lg" onClick={startPayment} disabled={starting}>
                    {starting ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="mr-1 h-4 w-4" />
                    )}
                    {starting ? "Starting secure payment…" : `Pay ${fmtMoney(invoice.total, invoice.currency)}`}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    You'll be redirected to our secure payment provider to complete this payment.
                  </p>
                </>
              )}
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
