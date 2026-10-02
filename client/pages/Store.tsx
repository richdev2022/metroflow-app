import { useCallback, useEffect, useState } from "react";
import {
  Store as StoreIcon, Plus, Copy, Check, Pencil, Trash2, PackageCheck,
  Ban, Loader2, ShoppingBag, TrendingUp, Clock, ExternalLink,
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

interface StoreProduct {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  currency: string;
  stock: number | null;
  image_url: string | null;
  status: "active" | "paused" | "draft";
  created_at: string;
}

interface StoreOrderItem {
  product_name: string;
  quantity: number;
  unit_price: string | number;
  amount: string | number;
}

interface StoreOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  subtotal: string | number;
  total: string | number;
  currency: string;
  status: "pending" | "paid" | "fulfilled" | "cancelled" | "failed";
  payment_provider: string | null;
  note: string | null;
  created_at: string;
  items: StoreOrderItem[];
}

interface StoreStats {
  total_orders: number;
  paid_orders: number;
  pending_orders: number;
  gross_sales: string | number;
  total_fees: string | number;
  net_sales: string | number;
}

const fmtMoney = (v: unknown, currency = "NGN") => {
  const n = Number(v) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    fulfilled: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    paused: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    draft: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  };
  return map[status] || map.pending;
};

export default function Store() {
  useSEO({
    title: "Store — Sell Anything, Get Paid Instantly",
    description:
      "List products and services in your Metricorex storefront, share one link and get paid straight into your wallet.",
    path: "/store",
    index: false,
  });

  const [tab, setTab] = useState<"products" | "orders">("products");
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [storeInfo, setStoreInfo] = useState<{ enabled: boolean; max_products: number | null; product_count: number } | null>(null);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // product form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StoreProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [status, setStatus] = useState<"active" | "paused" | "draft">("active");

  // order detail
  const [orderDetail, setOrderDetail] = useState<StoreOrder | null>(null);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([
        api.get("/store/products"),
        api.get("/store/orders"),
      ]);
      setProducts(p.data.products || []);
      setStoreInfo(p.data.store || null);
      setOrders(o.data.orders || []);
      setStats(o.data.stats || null);
    } catch {
      toast.error("Could not load your store");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const storeLink = () => {
    const businessId = localStorage.getItem("businessId");
    return `${window.location.origin}/store/public/${businessId}`;
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(storeLink());
      setCopied(true);
      toast.success("Store link copied — share it anywhere");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setPrice("");
    setStock("");
    setStatus("active");
    setDialogOpen(true);
  };

  const openEdit = (p: StoreProduct) => {
    setEditing(p);
    setName(p.name);
    setDescription(p.description || "");
    setPrice(String(p.price));
    setStock(p.stock == null ? "" : String(p.stock));
    setStatus(p.status);
    setDialogOpen(true);
  };

  const saveProduct = async () => {
    if (!name.trim()) return toast.error("Product name is required");
    if (!Number(price)) return toast.error("Price is required");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price),
        stock: stock === "" ? null : Number(stock),
        status,
      };
      if (editing) {
        await api.put(`/store/products/${editing.id}`, payload);
        toast.success("Product updated");
      } else {
        await api.post("/store/products", payload);
        toast.success("Product added to your store");
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not save the product");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (p: StoreProduct) => {
    try {
      await api.delete(`/store/products/${p.id}`);
      toast.success("Product deleted");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not delete the product");
    }
  };

  const fulfilOrder = async (o: StoreOrder) => {
    setBusyOrder(o.id);
    try {
      await api.post(`/store/orders/${o.id}/fulfil`);
      toast.success(`Order ${o.order_number} marked fulfilled`);
      setOrderDetail(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not fulfil the order");
    } finally {
      setBusyOrder(null);
    }
  };

  const cancelOrder = async (o: StoreOrder) => {
    setBusyOrder(o.id);
    try {
      await api.post(`/store/orders/${o.id}/cancel`);
      toast.success(`Order ${o.order_number} cancelled`);
      setOrderDetail(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not cancel the order");
    } finally {
      setBusyOrder(null);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/15">
              <StoreIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Store</h1>
              <p className="text-sm text-muted-foreground">
                List products & services, share your store link and get paid instantly.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={copyLink}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Copied" : "Copy store link"}
            </Button>
            <Button variant="outline" onClick={() => window.open(storeLink(), "_blank")}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add product
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Gross sales", value: fmtMoney(stats?.gross_sales), icon: TrendingUp },
            { label: "Net sales", value: fmtMoney(stats?.net_sales), icon: ShoppingBag },
            { label: "Paid orders", value: stats?.paid_orders ?? 0, icon: PackageCheck },
            { label: "Pending orders", value: stats?.pending_orders ?? 0, icon: Clock },
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

        {storeInfo && !storeInfo.enabled && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
            The Storefront is not available on your current plan. Kindly upgrade your plan to start selling.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {(["products", "orders"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {t === "products" ? `Products${storeInfo ? ` (${storeInfo.product_count}${storeInfo.max_products && storeInfo.max_products < 999999 ? `/${storeInfo.max_products}` : ""})` : ""}` : `Orders${stats ? ` (${stats.total_orders})` : ""}`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "products" ? (
          products.length === 0 ? (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <StoreIcon className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <h3 className="mt-3 font-semibold">Your store is empty</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                Add your first product or service, then share your store link with customers — they pay through a secure checkout and the money lands in your wallet.
              </p>
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" /> Add your first product
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <div key={p.id} className="group rounded-xl border bg-card overflow-hidden">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-36 w-full object-cover" />
                  ) : (
                    <div className="h-36 w-full bg-gradient-to-br from-indigo-100 via-violet-50 to-blue-100 dark:from-indigo-500/10 dark:via-violet-500/5 dark:to-blue-500/10 flex items-center justify-center">
                      <StoreIcon className="h-8 w-8 text-indigo-400/60" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{p.name}</h3>
                        <p className="text-sm text-muted-foreground">{fmtMoney(p.price, p.currency)}</p>
                      </div>
                      <Badge className={statusBadge(p.status)}>{p.status}</Badge>
                    </div>
                    {p.description && (
                      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {p.stock != null ? `${p.stock} in stock` : "Unlimited stock"}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteProduct(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <h3 className="mt-3 font-semibold">No orders yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              Share your store link with customers. Every paid order lands in your wallet minus a small platform fee.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {orders.map((o) => (
              <button
                key={o.id}
                onClick={() => setOrderDetail(o)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {o.customer_name}
                    <span className="ml-2 text-xs text-muted-foreground font-normal">{o.order_number}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.items?.length || 0} item{(o.items?.length || 0) === 1 ? "" : "s"} · {new Date(o.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-semibold">{fmtMoney(o.total, o.currency)}</span>
                  <Badge className={statusBadge(o.status)}>{o.status}</Badge>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Product dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle>
              <DialogDescription>
                Customers see this on your public store page and pay through secure checkout.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Name</Label>
                <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website design package" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-desc">Description</Label>
                <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does the buyer get?" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="p-price">Price (₦)</Label>
                  <Input id="p-price" type="number" min={50} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5000" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-stock">Stock (blank = unlimited)</Label>
                  <Input id="p-stock" type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} placeholder="50" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <div className="flex gap-2">
                  {(["active", "paused", "draft"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                        status === st ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveProduct} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Save changes" : "Add product"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Order detail dialog */}
        <Dialog open={!!orderDetail} onOpenChange={(o) => !o && setOrderDetail(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Order {orderDetail?.order_number}</DialogTitle>
              <DialogDescription>
                {orderDetail?.customer_name}
                {orderDetail?.customer_email ? ` · ${orderDetail.customer_email}` : ""}
                {orderDetail?.customer_phone ? ` · ${orderDetail.customer_phone}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg border divide-y">
                {orderDetail?.items?.map((i, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="truncate">
                      {i.product_name} <span className="text-muted-foreground">× {i.quantity}</span>
                    </span>
                    <span className="font-medium">{fmtMoney(i.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
                  <span>Total</span>
                  <span>{fmtMoney(orderDetail?.total, orderDetail?.currency)}</span>
                </div>
              </div>
              {orderDetail?.note && (
                <p className="text-sm text-muted-foreground">Note: {orderDetail.note}</p>
              )}
              {orderDetail && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusBadge(orderDetail.status)}>{orderDetail.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(orderDetail.created_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              {orderDetail?.status === "pending" && (
                <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => cancelOrder(orderDetail)} disabled={busyOrder === orderDetail.id}>
                  {busyOrder === orderDetail.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
                  Cancel order
                </Button>
              )}
              {orderDetail?.status === "paid" && (
                <Button onClick={() => fulfilOrder(orderDetail)} disabled={busyOrder === orderDetail.id}>
                  {busyOrder === orderDetail.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}
                  Mark fulfilled
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
