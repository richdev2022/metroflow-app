import { useCallback, useEffect, useState } from "react";
import { Link2, Plus, Copy, Check, Trash2, ExternalLink, Loader2, Power, TrendingUp, Eye, Pencil, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Layout from "@/components/layout";
import EntityTransactionsDrawer, { EntityTransactionsTarget } from "@/components/EntityTransactionsDrawer";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useSEO } from "@/lib/use-seo";

interface PaymentLink {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  amount: string | number | null;
  currency: string;
  allow_custom_amount: boolean;
  is_active: boolean;
  views: number;
  successful_payments: number;
  total_collected: string | number;
  created_at: string;
}

const fmtMoney = (v: unknown, currency = "NGN") => {
  const n = Number(v) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function PaymentLinks() {
  useSEO({
    title: "Payment Links — Get Paid Faster",
    description:
      "Create shareable payment links and get paid straight into your Metricorex wallet — for both Personal and Business.",
    path: "/payment-links",
    index: false,
  });
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentLink | null>(null);
  // When set, the form dialog edits this existing link instead of creating one.
  const [editingLink, setEditingLink] = useState<PaymentLink | null>(null);
  // When set, the drill-down drawer lists every payment received through this link.
  const [txTarget, setTxTarget] = useState<EntityTransactionsTarget | null>(null);

  // create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [allowCustom, setAllowCustom] = useState(false);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/payment-links");
      setLinks(res.data?.links || []);
    } catch {
      toast.error("Could not load your payment links");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const openEdit = (link: PaymentLink) => {
    setEditingLink(link);
    setTitle(link.title || "");
    setDescription(link.description || "");
    setAmount(link.amount != null ? String(link.amount) : "");
    setAllowCustom(!!link.allow_custom_amount);
    setCreateOpen(true);
  };

  const openCreate = () => {
    setEditingLink(null);
    setTitle("");
    setDescription("");
    setAmount("");
    setAllowCustom(false);
    setCreateOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Give your link a title");
      return;
    }
    if (!allowCustom && !(Number(amount) > 0)) {
      toast.error("Enter an amount or allow customers to choose");
      return;
    }
    setCreating(true);
    try {
      if (editingLink) {
        await api.put(`/payment-links/${editingLink.id}`, {
          title: title.trim(),
          // Empty string explicitly clears the description; backend COALESCEs
          // null so empty string is the only way to wipe it.
          description: description.trim(),
          amount: allowCustom ? null : Number(amount),
          allow_custom_amount: allowCustom,
          is_active: editingLink.is_active,
        });
        toast.success("Payment link updated");
      } else {
        await api.post("/payment-links", {
          title: title.trim(),
          description: description.trim() || undefined,
          amount: allowCustom ? undefined : Number(amount),
          allow_custom_amount: allowCustom,
        });
        toast.success("Payment link created — share it with your customers");
      }
      setCreateOpen(false);
      setEditingLink(null);
      setTitle("");
      setDescription("");
      setAmount("");
      setAllowCustom(false);
      fetchLinks();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (editingLink ? "Could not update the payment link" : "Could not create the payment link");
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const shareUrl = (slug: string) => `${window.location.origin}/pay/${slug}`;

  const copyLink = async (link: PaymentLink) => {
    try {
      await navigator.clipboard.writeText(shareUrl(link.slug));
      setCopiedSlug(link.slug);
      toast.success("Link copied");
      setTimeout(() => setCopiedSlug(null), 1600);
    } catch {
      toast.error("Could not copy — long-press the link instead");
    }
  };

  const toggleActive = async (link: PaymentLink) => {
    try {
      await api.put(`/payment-links/${link.id}`, { is_active: !link.is_active });
      fetchLinks();
    } catch {
      toast.error("Could not update the link");
    }
  };

  /** Drill-down: every payment collected through this specific link. */
  const openPayments = (link: PaymentLink) => {
    setTxTarget({
      kind: "payment-link",
      id: link.id,
      title: link.title,
      subtitle: link.allow_custom_amount
        ? "Open-amount link"
        : `${fmtMoney(link.amount, link.currency)} · ${link.is_active ? "Active" : "Paused"}`,
      publicUrl: shareUrl(link.slug),
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/payment-links/${deleteTarget.id}`);
      toast.success("Payment link deleted");
      setDeleteTarget(null);
      fetchLinks();
    } catch {
      toast.error("Could not delete the link");
    }
  };

  return (
    <Layout>
      <div className="flex h-full flex-col">
      {/* Page header */}
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight">Payment Links</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Get paid faster — share a link, customers pay, money lands in your wallet (minus the
              collection fee).
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="mr-1 h-4 w-4" /> New Link
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : links.length === 0 ? (
          <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed p-10 text-center">
            <Link2 className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No payment links yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a link for invoices, products, donations or tickets. Customers pay by card or
              transfer and you get settled straight into your Metricorex wallet.
            </p>
            <Button className="mt-5" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Create your first link
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {links.map((link) => (
              <div
                key={link.id}
                role="button"
                tabIndex={0}
                onClick={() => openPayments(link)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openPayments(link);
                  }
                }}
                className="flex cursor-pointer flex-col rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">{link.title}</h3>
                    <p className="mt-0.5 line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
                      {link.description || "No description"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      link.is_active
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {link.is_active ? "Active" : "Paused"}
                  </span>
                </div>

                <div className="mt-3 text-2xl font-bold tracking-tight">
                  {link.allow_custom_amount
                    ? "Open amount"
                    : fmtMoney(link.amount, link.currency)}
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" /> {link.views} views
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" /> {link.successful_payments} paid ·{" "}
                    {fmtMoney(link.total_collected, link.currency)}
                  </span>
                </div>

                <div className="mt-4 truncate rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {shareUrl(link.slug)}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPayments(link);
                    }}
                  >
                    <ReceiptText className="mr-1 h-3.5 w-3.5" />
                    Payments
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyLink(link);
                    }}
                  >
                    {copiedSlug === link.slug ? (
                      <Check className="mr-1 h-3.5 w-3.5" />
                    ) : (
                      <Copy className="mr-1 h-3.5 w-3.5" />
                    )}
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(shareUrl(link.slug), "_blank");
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    title="Edit link"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(link);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    title={link.is_active ? "Pause" : "Activate"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleActive(link);
                    }}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(link);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLink ? "Edit payment link" : "Create payment link"}</DialogTitle>
            <DialogDescription>
              {editingLink
                ? "Update the title, description or amount — the shareable link and its history stay the same."
                : "Customers pay through our secure checkout; funds settle into your wallet minus the collection fee."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pl-title">Title</Label>
              <Input
                id="pl-title"
                placeholder="e.g. Website design invoice"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={140}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-desc">Description (optional)</Label>
              <Textarea
                id="pl-desc"
                placeholder="What is this payment for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="pl-custom" className="text-sm font-medium">
                  Let customer choose amount
                </Label>
                <p className="text-xs text-muted-foreground">Good for donations and tips</p>
              </div>
              <Switch id="pl-custom" checked={allowCustom} onCheckedChange={setAllowCustom} />
            </div>
            {!allowCustom && (
              <div className="space-y-1.5">
                <Label htmlFor="pl-amount">Amount (NGN)</Label>
                <Input
                  id="pl-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="e.g. 25000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditingLink(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={creating}>
              {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : (editingLink ? <Pencil className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />)}
              {editingLink ? "Save changes" : "Create link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete payment link?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.title}” will stop accepting payments immediately. Payments already
              received are not affected.
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

      {/* Per-link payments drill-down */}
      <EntityTransactionsDrawer target={txTarget} onClose={() => setTxTarget(null)} />
      </div>
    </Layout>
  );
}
