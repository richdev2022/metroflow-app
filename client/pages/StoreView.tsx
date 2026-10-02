import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Store as StoreIcon, Loader2, ShoppingBag, Minus, Plus, Trash2, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useSEO } from "@/lib/use-seo";

interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  stock: number | null;
  image_url: string | null;
  sold_out: boolean;
}

interface StoreInfo {
  business_id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
}

const fmtMoney = (v: unknown, currency = "NGN") => {
  const n = Number(v) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function StoreView() {
  useSEO({ title: "Store", description: "Browse and shop this Metricorex storefront.", index: false });

  const { businessId } = useParams();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // cart: productId -> qty
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    api
      .get(`/store/public/${businessId}`)
      .then((res) => {
        setStore(res.data.store || null);
        setProducts(res.data.products || []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [businessId]);

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
        .filter((i) => i.product),
    [cart, products]
  );
  const cartTotal = cartItems.reduce((sum, i) => sum + (i.product!.price || 0) * i.qty, 0);
  const cartCount = cartItems.reduce((sum, i) => sum + i.qty, 0);

  const addToCart = (p: PublicProduct) => {
    setCart((c) => {
      const current = c[p.id] || 0;
      if (p.stock != null && current + 1 > p.stock) {
        toast.error(`Only ${p.stock} left in stock`);
        return c;
      }
      return { ...c, [p.id]: current + 1 };
    });
  };

  const setQty = (id: string, qty: number) => {
    const product = products.find((p) => p.id === id);
    if (product?.stock != null && qty > product.stock) {
      toast.error(`Only ${product.stock} left in stock`);
      return;
    }
    setCart((c) => ({ ...c, [id]: Math.max(0, qty) }));
  };

  const placeOrder = async () => {
    if (!customerName.trim()) return toast.error("Your name is required");
    if (!customerEmail.trim()) return toast.error("Your email is required for the receipt");
    setPlacing(true);
    try {
      const res = await api.post(`/store/public/${businessId}/checkout`, {
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim() || undefined,
        note: note.trim() || undefined,
        items: cartItems.map((i) => ({ product_id: i.product!.id, quantity: i.qty })),
      });
      window.location.href = res.data.checkout_url;
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Could not place the order");
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <StoreIcon className="h-12 w-12 text-muted-foreground/40" />
        <h1 className="text-xl font-bold">Storefront not found</h1>
        <p className="text-sm text-muted-foreground">This store doesn't exist or isn't accepting orders right now.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Store header */}
      <header className="border-b bg-gradient-to-br from-indigo-50 via-violet-50 to-blue-50 dark:from-indigo-500/10 dark:via-violet-500/5 dark:to-blue-500/10">
        <div className="max-w-5xl mx-auto px-4 py-10 flex items-center gap-4">
          {store.logo_url ? (
            <img src={store.logo_url} alt={store.name} className="h-16 w-16 rounded-2xl object-cover shadow" />
          ) : (
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-xl font-bold shadow">
              {store.name.substring(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Metricorex Store</p>
            <h1 className="text-2xl font-bold">{store.name}</h1>
            {store.description && <p className="text-sm text-muted-foreground mt-0.5">{store.description}</p>}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {products.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No products available right now — check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <div key={p.id} className="rounded-xl border bg-card overflow-hidden flex flex-col">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="h-40 w-full object-cover" />
                ) : (
                  <div className="h-40 w-full bg-gradient-to-br from-indigo-100 via-violet-50 to-blue-100 dark:from-indigo-500/10 dark:via-violet-500/5 dark:to-blue-500/10 flex items-center justify-center">
                    <StoreIcon className="h-8 w-8 text-indigo-400/60" />
                  </div>
                )}
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2 flex-1">{p.description}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-bold">{fmtMoney(p.price, p.currency)}</span>
                    <Button size="sm" disabled={p.sold_out} onClick={() => addToCart(p)}>
                      {p.sold_out ? "Sold out" : "Add"}
                    </Button>
                  </div>
                  {p.stock != null && p.stock > 0 && p.stock <= 5 && (
                    <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">Only {p.stock} left</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Floating cart bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-4 inset-x-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto sm:min-w-[380px] z-40">
          <button
            onClick={() => setCheckoutOpen(true)}
            className="w-full flex items-center justify-between gap-3 rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-lg hover:opacity-95 transition"
          >
            <span className="flex items-center gap-2 font-medium">
              <ShoppingBag className="h-4 w-4" />
              {cartCount} item{cartCount === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-2 font-semibold">
              {fmtMoney(cartTotal)}
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      )}

      {/* Cart + checkout dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your order</DialogTitle>
            <DialogDescription>Review your items and check out securely.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border divide-y">
              {cartItems.map(({ product, qty }) => (
                <div key={product!.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{product!.name}</p>
                    <p className="text-xs text-muted-foreground">{fmtMoney(product!.price, product!.currency)} each</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(product!.id, qty - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">{qty}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(product!.id, qty + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setQty(product!.id, 0)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2.5 text-sm font-semibold">
                <span>Total</span>
                <span>{fmtMoney(cartTotal)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Your name</Label>
                <Input id="c-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Ada Obi" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email (receipt)</Label>
                <Input id="c-email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="ada@example.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone (optional)</Label>
              <Input id="c-phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="0803..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-note">Note to seller (optional)</Label>
              <Textarea id="c-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Delivery instructions, preferences…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Keep shopping</Button>
            <Button onClick={placeOrder} disabled={placing}>
              {placing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Pay {fmtMoney(cartTotal)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
