import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText, Plus, Copy, Check, Trash2, Loader2, XCircle, Eye, CalendarDays, Send, ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useSEO } from "@/lib/use-seo";
import { cn } from "@/lib/utils";

interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  amount: number | string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  status: string; // draft | pending | paid | cancelled (overdue computed client-side)
  due_date: string | null;
  notes: string | null;
  tax_percent: string | number;
  subtotal: string | number;
  tax_amount: string | number;
  total: string | number;
  amount_paid: string | number;
  views: number;
  item_count?: number;
  total_paid?: string | number;
  created_at: string;
}

interface InvoicePayment {
  id: string;
  transaction_reference: string;
  payer_name: string | null;
  payer_email: string | null;
  amount: string | number;
  fee: string | number;
  net_amount: string | number;
  currency: string;
  status: string;
  payment_provider: string | null;
  created_at: string;
}

const fmtMoney = (v: unknown, currency = "NGN", compact = false) => {
  const n = Number(v) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  if (compact && n >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`;
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "No due date";

function statusMeta(inv: Invoice): { label: string; className: string } {
  if (inv.status === "paid") return { label: "Paid", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  if (inv.status === "cancelled") return { label: "Cancelled", className: "bg-muted text-muted-foreground" };
  if (inv.status === "draft") return { label: "Draft", className: "bg-muted text-muted-foreground" };
  if (inv.due_date && new Date(inv.due_date) < new Date(new Date().toDateString()))
    return { label: "Overdue", className: "bg-red-500/10 text-red-600 dark:text-red-400" };
  return { label: "Pending", className: "bg-amber-500/10 text-amber-600 dark:text-amber-500" };
}

interface DraftItem {
  description: string;
  quantity: string;
  unit_price: string;
}

const emptyDraftItem = (): DraftItem => ({ description: "", quantity: "1", unit_price: "" });

export default function Invoices() {
  useSEO({
    title: "Invoices — Bill Clients Professionally",
    description:
      "Create and send itemised invoices with due dates. Clients pay online and funds settle straight into your Metricorex wallet.",
    path: "/invoices",
    index: false,
  });

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [paymentsFor, setPaymentsFor] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // create form state
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [taxPercent, setTaxPercent] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [saveAsDraft, setSaveAsDraft] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/invoices");
      setInvoices(res.data?.invoices || []);
    } catch {
      toast.error("Could not load your invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const draftTotals = useMemo(() => {
    const subtotal = items.reduce(
      (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
      0,
    );
    const tax = subtotal * ((Number(taxPercent) || 0) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [items, taxPercent]);

  const setItem = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const handleCreate = async () => {
    if (!clientName.trim()) {
      toast.error("Who are you invoicing? Add the client's name");
      return;
    }
    if (!clientEmail.trim()) {
      toast.error("The client's email is required for their payment page");
      return;
    }
    const cleanItems = items
      .filter((it) => it.description.trim())
      .map((it) => ({
        description: it.description.trim(),
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
      }));
    if (cleanItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    setCreating(true);
    try {
      await api.post("/invoices", {
        client_name: clientName.trim(),
        client_email: clientEmail.trim(),
        client_phone: clientPhone.trim() || undefined,
        items: cleanItems,
        tax_percent: Number(taxPercent) || 0,
        due_date: dueDate || undefined,
        notes: notes.trim() || undefined,
        status: saveAsDraft ? "draft" : "pending",
      });
      toast.success(saveAsDraft ? "Invoice saved as draft" : "Invoice created — share it with your client");
      closeCreate();
      fetchInvoices();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Could not create the invoice";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setClientName("");
    setClientEmail("");
    setClientPhone("");
    setDueDate("");
    setNotes("");
    setTaxPercent("");
    setItems([emptyDraftItem()]);
    setSaveAsDraft(false);
  };

  const payUrl = (inv: Invoice) => `${window.location.origin}/invoices/${inv.id}/pay`;

  const copyLink = async (inv: Invoice) => {
    try {
      await navigator.clipboard.writeText(payUrl(inv));
      setCopiedId(inv.id);
      toast.success("Payment link copied");
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      toast.error("Could not copy — long-press the link instead");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/invoices/${deleteTarget.id}`);
      toast.success("Invoice deleted");
      setDeleteTarget(null);
      fetchInvoices();
    } catch (e: unknown) {
      toast.error(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          "Could not delete the invoice",
      );
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await api.post(`/invoices/${cancelTarget.id}/cancel`);
      toast.success("Invoice cancelled");
      setCancelTarget(null);
      fetchInvoices();
    } catch (e: unknown) {
      toast.error(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          "Could not cancel the invoice",
      );
    }
  };

  const openPayments = async (inv: Invoice) => {
    setPaymentsFor(inv);
    setPaymentsLoading(true);
    try {
      const res = await api.get(`/invoices/${inv.id}`);
      setPayments(res.data?.payments || []);
    } catch {
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  /** How much of this invoice has actually been paid: the backend-stamped
   *  amount_paid when present, else the successful payments just loaded. */
  const invoicePaidAmount = (inv: Invoice, loaded: InvoicePayment[]) => {
    const stamped = Number(inv.amount_paid ?? inv.total_paid);
    if (!Number.isNaN(stamped) && stamped > 0) return stamped;
    return loaded
      .filter((p) => p.status === "success")
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  };

  const activeCount = invoices.filter((i) => i.status === "pending").length;
  const paidTotal = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + (Number(i.total) || 0), 0);

  return (
    <Layout>
      <div className="flex h-full flex-col">
        {/* Page header */}
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight">Invoices</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Bill clients with itemised invoices — they pay online, you get settled into your
                wallet (minus the settlement fee).
              </p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" /> New Invoice
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed p-10 text-center">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-semibold">No invoices yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your first invoice with line items, tax and a due date. Your client gets a
                secure online payment page — no account needed.
              </p>
              <Button className="mt-5" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Create your first invoice
              </Button>
            </div>
          ) : (
            <>
              {/* Summary strip */}
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Awaiting payment</p>
                  <p className="mt-1 text-xl font-bold">{activeCount}</p>
                </div>
                <div className="rounded-2xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Paid (all time)</p>
                  <p className="mt-1 text-xl font-bold">{fmtMoney(paidTotal, "NGN", true)}</p>
                </div>
                <div className="rounded-2xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Total invoices</p>
                  <p className="mt-1 text-xl font-bold">{invoices.length}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {invoices.map((inv) => {
                  const meta = statusMeta(inv);
                  return (
                    <div
                      key={inv.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openPayments(inv)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openPayments(inv);
                        }
                      }}
                      className="flex cursor-pointer flex-col rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold">{inv.client_name}</h3>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {inv.invoice_number} · {inv.item_count ?? 0} item
                            {(inv.item_count ?? 0) === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            meta.className,
                          )}
                        >
                          {meta.label}
                        </span>
                      </div>

                      <div className="mt-3 text-2xl font-bold tracking-tight">
                        {fmtMoney(inv.total, "NGN")}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" /> Due {fmtDate(inv.due_date)}
                        </span>
                        {Number(inv.tax_percent) > 0 && (
                          <span>VAT {Number(inv.tax_percent)}%</span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" /> {inv.views} views
                        </span>
                      </div>

                      {inv.status !== "draft" && inv.status !== "cancelled" && (
                        <div className="mt-4 truncate rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                          {payUrl(inv)}
                        </div>
                      )}

                      <div className="mt-4 flex items-center gap-2">
                        {inv.status === "pending" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyLink(inv);
                            }}
                          >
                            {copiedId === inv.id ? (
                              <Check className="mr-1 h-3.5 w-3.5" />
                            ) : (
                              <Copy className="mr-1 h-3.5 w-3.5" />
                            )}
                            Copy link
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          title="Payments"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPayments(inv);
                          }}
                        >
                          <ReceiptText className="h-3.5 w-3.5" />
                        </Button>
                        {inv.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            title="Cancel invoice"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCancelTarget(inv);
                            }}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {inv.status !== "paid" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            title="Delete invoice"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(inv);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={(open) => (open ? setCreateOpen(true) : closeCreate())}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create invoice</DialogTitle>
              <DialogDescription>
                Your client gets a secure payment page. Funds settle into your wallet minus the
                settlement fee (1%, capped at ₦2,500 — plan discounts apply).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-name">Client name</Label>
                  <Input
                    id="inv-name"
                    placeholder="e.g. Acme Ltd"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    maxLength={255}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-email">Client email</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    placeholder="billing@acme.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-phone">Client phone (optional)</Label>
                  <Input
                    id="inv-phone"
                    placeholder="e.g. 0803 000 0000"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-due">Due date</Label>
                  <Input
                    id="inv-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Line items</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setItems((prev) => [...prev, emptyDraftItem()])}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add item
                  </Button>
                </div>
                {items.map((it, idx) => (
                  <div key={idx} className="rounded-xl border p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="What did you do? e.g. Logo design"
                        value={it.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })}
                        maxLength={500}
                      />
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Qty</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.quantity}
                          onChange={(e) => setItem(idx, { quantity: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Unit price (₦)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={it.unit_price}
                          onChange={(e) => setItem(idx, { unit_price: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Amount</Label>
                        <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm font-medium">
                          {fmtMoney((Number(it.quantity) || 0) * (Number(it.unit_price) || 0), "NGN")}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-tax">Tax / VAT (%)</Label>
                  <Input
                    id="inv-tax"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="e.g. 7.5"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-notes">Notes (optional)</Label>
                  <Textarea
                    id="inv-notes"
                    placeholder="Payment terms, bank details, thank-you note…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-1 rounded-xl border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{fmtMoney(draftTotals.subtotal, "NGN")}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax ({Number(taxPercent) || 0}%)</span>
                  <span>{fmtMoney(draftTotals.tax, "NGN")}</span>
                </div>
                <div className="flex justify-between border-t pt-1 text-base font-bold">
                  <span>Total</span>
                  <span>{fmtMoney(draftTotals.total, "NGN")}</span>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={saveAsDraft}
                  onChange={(e) => setSaveAsDraft(e.target.checked)}
                />
                Save as draft (don't share with the client yet)
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeCreate}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1 h-4 w-4" />
                )}
                {saveAsDraft ? "Save draft" : "Create invoice"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete invoice?</DialogTitle>
              <DialogDescription>
                Invoice {deleteTarget?.invoice_number} for {deleteTarget?.client_name} will be
                removed permanently. Payments already received are not affected.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel confirm */}
        <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancel invoice?</DialogTitle>
              <DialogDescription>
                Invoice {cancelTarget?.invoice_number} will be marked cancelled and its payment page
                will stop working. This can't be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelTarget(null)}>
                Keep invoice
              </Button>
              <Button variant="destructive" onClick={confirmCancel}>
                <XCircle className="mr-1 h-4 w-4" /> Cancel invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payments dialog */}
        <Dialog open={!!paymentsFor} onOpenChange={(open) => !open && setPaymentsFor(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span>Payments — {paymentsFor?.invoice_number}</span>
                {paymentsFor && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      statusMeta(paymentsFor).className,
                    )}
                  >
                    {statusMeta(paymentsFor).label}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                {paymentsFor?.client_name} · {fmtMoney(paymentsFor?.total, "NGN")} total
              </DialogDescription>
            </DialogHeader>
            {paymentsFor && (
              <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">
                  Paid {fmtMoney(invoicePaidAmount(paymentsFor, payments), "NGN")} of{" "}
                  {fmtMoney(paymentsFor.total, "NGN")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {payments.filter((p) => p.status === "success").length} of {payments.length} payment
                  {payments.length === 1 ? "" : "s"} successful
                </span>
              </div>
            )}
            {paymentsLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : payments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No payments yet. Share the invoice link with your client.
              </p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {payments.map((p) => (
                  <div key={p.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.payer_name || p.payer_email || "Payment"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(p.created_at).toLocaleString()} · {p.payment_provider || "unknown"}
                        </p>
                        {p.transaction_reference && (
                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                            {p.transaction_reference}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p className="font-semibold">{fmtMoney(p.amount, p.currency)}</p>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] capitalize",
                            p.status === "success" && "bg-emerald-500/10 text-emerald-600",
                            p.status === "pending" && "bg-amber-500/10 text-amber-600",
                            p.status === "failed" && "bg-red-500/10 text-red-600",
                          )}
                        >
                          {p.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
