import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Clock, XCircle, Loader2, ShoppingBag } from "lucide-react";
import { api } from "@/lib/api-client";
import { useSEO } from "@/lib/use-seo";

interface OrderItem {
  product_name: string;
  quantity: number;
  unit_price: string | number;
  amount: string | number;
}

interface Order {
  order_number: string;
  customer_name: string;
  subtotal: string | number;
  total: string | number;
  currency: string;
  status: string;
  created_at: string;
  business_name: string;
}

const fmtMoney = (v: unknown, currency = "NGN") => {
  const n = Number(v) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function StoreOrder() {
  useSEO({ title: "Order Status", description: "Track your store order.", index: false });

  const { reference } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!reference) return;
    let tries = 0;
    const load = async () => {
      try {
        const res = await api.get(`/store/public/order/${reference}`);
        setOrder(res.data.order);
        setItems(res.data.items || []);
        setLoading(false);
        // While the payment is still pending, poll a few times so the page
        // flips to "paid" when the webhook lands.
        if (res.data.order?.status === "pending" && tries < 24) {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <XCircle className="h-12 w-12 text-muted-foreground/40" />
        <h1 className="text-xl font-bold">Order not found</h1>
        <p className="text-sm text-muted-foreground">This order link is invalid or has expired.</p>
      </div>
    );
  }

  const paid = order.status === "paid" || order.status === "fulfilled";
  const cancelled = order.status === "cancelled" || order.status === "failed";

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 py-14">
        <div className="rounded-2xl border bg-card p-6 sm:p-8 shadow-sm">
          <div className="text-center">
            {paid ? (
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
            ) : cancelled ? (
              <XCircle className="mx-auto h-14 w-14 text-red-500" />
            ) : (
              <Clock className="mx-auto h-14 w-14 text-amber-500" />
            )}
            <h1 className="mt-3 text-xl font-bold">
              {paid ? "Payment successful" : cancelled ? "Order cancelled" : "Awaiting payment"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {paid
                ? `Your order from ${order.business_name} is confirmed.`
                : cancelled
                ? "This order was not completed. If you were charged, contact the seller."
                : "Complete the payment to confirm your order. This page updates automatically."}
            </p>
          </div>

          <div className="mt-6 rounded-xl border divide-y">
            {items.map((i, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <span className="truncate pr-3">
                  {i.product_name} <span className="text-muted-foreground">× {i.quantity}</span>
                </span>
                <span className="font-medium shrink-0">{fmtMoney(i.amount, order.currency)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2.5 text-sm font-semibold">
              <span>Total</span>
              <span>{fmtMoney(order.total, order.currency)}</span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Order {order.order_number}</span>
            <span>{new Date(order.created_at).toLocaleString()}</span>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShoppingBag className="h-3.5 w-3.5" />
            Powered by{" "}
            <Link to="/" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              Metricorex
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
