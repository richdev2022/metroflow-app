import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, AlertTriangle, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CallbackStatus = 'verifying' | 'success' | 'failed' | 'warning' | 'cancelled';

export default function PaymentCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<CallbackStatus>('verifying');
  const [message, setMessage] = useState("Re-verifying your payment with the payment provider...");
  const [returnPath, setReturnPath] = useState("/subscription");
  // Mirror of returnPath for use inside async callbacks (avoids stale closure
  // navigating to /subscription instead of /wallet on wallet-funding success).
  const returnPathRef = useRef("/subscription");
  // Guards against React StrictMode double-mounting the effect and replaying
  // the verification twice in a row.
  const verifyingRef = useRef(false);

  const verify = useCallback(async (params: URLSearchParams, toastFn: typeof toast) => {
    // Wallet funding redirects from the backend carry ?status=...&reference=...&token=...
    // Flutterwave's own redirect carries tx_ref instead of reference — accept both.
    const preStatus = params.get("status");
    const reference =
      params.get("reference") ||
      params.get("paymentReference") ||
      params.get("tx_ref");

    // A fresh token may accompany the redirect (session can lapse during checkout)
    const freshToken = params.get("token");
    if (freshToken) {
      try { localStorage.setItem("token", freshToken); } catch { /* ignore */ }
    }

    // Wallet-funding references start with FUND- (see POST /wallet/fund/card)
    const isWalletFunding = !!reference && reference.startsWith("FUND-");
    if (isWalletFunding) {
      setReturnPath("/wallet");
      returnPathRef.current = "/wallet";
    }

    if (!reference) {
      setStatus('failed');
      setMessage("No transaction reference found. Please go back and start the payment again.");
      return;
    }

    // ALWAYS re-verify server-side: the authoritative outcome comes from the
    // payment provider, not from redirect query params.
    try {
      const response = await api.post("/subscription/verify-payment", { reference });

      if (response.data?.success) {
        const responseMessage = response.data.message;
        // Check for warning conditions in the message
        if (responseMessage && (responseMessage.includes("card token not received") || responseMessage.includes("warning"))) {
          setStatus('warning');
          setMessage(responseMessage);
          toastFn({
            title: "Attention Needed",
            description: responseMessage,
            variant: "default",
            className: "border-yellow-500",
          });
          // Do not auto-redirect on warning
        } else {
          const amount = response.data.amount != null ? Number(response.data.amount) : null;
          setStatus('success');
          setMessage(
            (amount && !Number.isNaN(amount)
              ? `${isWalletFunding ? "Wallet" : "Payment"} funded with ₦${amount.toLocaleString()} successfully!`
              : (responseMessage || "Payment successful!"))
          );
          toastFn({
            title: "Success",
            description: isWalletFunding ? "Wallet funded successfully." : (responseMessage || "Subscription updated successfully."),
          });
          // Auto-return to the app after a short pause on clean success
          setTimeout(() => navigate(returnPathRef.current), 2500);
        }
      } else if (response.data?.cancelled) {
        setStatus('cancelled');
        setMessage(response.data.message || "Payment cancelled — no money was deducted.");
        toastFn({ title: "Payment cancelled", description: "No money was deducted." });
      } else {
        setStatus('failed');
        setMessage(response.data?.error || "We could not verify your payment yet. If you were debited, it will reflect shortly — you can also try again.");
      }
    } catch (error: any) {
      console.error("Verification error:", error);
      // Fall back to the redirect-provided status when the re-verify call
      // itself fails (network/server hiccup) so the user still gets context.
      if (isWalletFunding && preStatus === 'cancelled') {
        setStatus('cancelled');
        setMessage("Payment cancelled — no money was deducted.");
        return;
      }
      if (isWalletFunding && preStatus === 'pending_settlement') {
        setStatus('warning');
        setMessage("We received your payment, but crediting your wallet is delayed. It will be retried automatically.");
        return;
      }
      setStatus('failed');
      setMessage(
        error?.response?.data?.error ||
          "An error occurred while verifying your payment. Please try again.",
      );
    }
  }, [navigate]);

  useEffect(() => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    const params = new URLSearchParams(location.search);
    verify(params, toast);
  }, [location, verify, toast]);

  const retry = () => {
    verifyingRef.current = false;
    setStatus('verifying');
    setMessage("Re-verifying your payment with the payment provider...");
    verify(new URLSearchParams(location.search), toast);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            {status === 'verifying' && <Loader2 className="h-12 w-12 animate-spin text-primary" />}
            {status === 'success' && <CheckCircle className="h-12 w-12 text-green-500" />}
            {status === 'failed' && <XCircle className="h-12 w-12 text-red-500" />}
            {status === 'warning' && <AlertTriangle className="h-12 w-12 text-yellow-500" />}
            {status === 'cancelled' && <Ban className="h-12 w-12 text-amber-500" />}
          </div>
          <CardTitle>
            {status === 'verifying' && "Verifying Payment"}
            {status === 'success' && "Payment Successful"}
            {status === 'failed' && "Payment Not Verified"}
            {status === 'warning' && "Payment Verified with Issues"}
            {status === 'cancelled' && "Payment Cancelled"}
          </CardTitle>
          <CardDescription className={
            status === 'warning' ? "text-yellow-600 dark:text-yellow-400 font-medium mt-2"
            : status === 'cancelled' ? "text-amber-600 dark:text-amber-400 font-medium mt-2"
            : "mt-2"
          }>
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {status === 'verifying' && null}
          {status === 'failed' && (
            <Button onClick={retry} className="mt-4">Try again</Button>
          )}
          {status !== 'verifying' && (
            <Button
              variant={status === 'failed' ? "outline" : "default"}
              onClick={() => navigate(returnPath)}
              className={status === 'failed' ? "" : "mt-4"}
            >
              {returnPath === "/wallet" ? "Return to Wallet" : "Return to Subscription"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
