import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, AlertTriangle, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PaymentCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed' | 'warning' | 'cancelled'>('verifying');
  const [message, setMessage] = useState("Verifying your payment...");
  const [returnPath, setReturnPath] = useState("/subscription");

  useEffect(() => {
    const verifyPayment = async () => {
      const searchParams = new URLSearchParams(location.search);
      // Wallet funding redirects from the backend carry ?status=...&reference=...&token=...
      const preStatus = searchParams.get("status");
      const reference = searchParams.get("reference") || searchParams.get("paymentReference"); // Handle both query params

      // A fresh token may accompany the redirect (session can lapse during checkout)
      const freshToken = searchParams.get("token");
      if (freshToken) {
        try { localStorage.setItem("token", freshToken); } catch { /* ignore */ }
      }

      // Wallet-funding references start with FUND- (see POST /wallet/fund/card)
      const isWalletFunding = !!reference && reference.startsWith("FUND-");
      if (isWalletFunding) setReturnPath("/wallet");

      if (!reference) {
        setStatus('failed');
        setMessage("No transaction reference found.");
        return;
      }

      // The backend verify page already determined the outcome for wallet funding.
      // A user-initiated checkout cancellation is NOT an error: no money moved.
      if (isWalletFunding && preStatus && preStatus !== "success") {
        if (preStatus === 'cancelled') {
          setStatus('cancelled');
          setMessage("Payment cancelled — no money was deducted. You can start a new payment whenever you're ready.");
          toast({
            title: "Payment cancelled",
            description: "No money was deducted.",
          });
          return;
        }
        setStatus(preStatus === 'pending_settlement' ? 'warning' : 'failed');
        setMessage(
          preStatus === 'pending_settlement'
            ? "We received your payment, but crediting your wallet is delayed. It will be retried automatically."
            : "We could not verify your payment. Please contact support if you have been debited."
        );
        return;
      }

      try {
        const response = await api.post("/subscription/verify-payment", { reference });

        if (response.data.success) {
          const responseMessage = response.data.message;
          // Check for warning conditions in the message
          if (responseMessage && (responseMessage.includes("card token not received") || responseMessage.includes("warning"))) {
             setStatus('warning');
             setMessage(responseMessage);
             toast({
               title: "Attention Needed",
               description: responseMessage,
               variant: "default",
               className: "border-yellow-500"
             });
             // Do not auto-redirect on warning
          } else {
             setStatus('success');
             setMessage(
               isWalletFunding
                 ? (responseMessage || "Payment successful! Your wallet has been funded.")
                 : (responseMessage || "Payment successful! Your subscription has been updated.")
             );
             toast({
               title: "Success",
               description: isWalletFunding ? "Wallet funded successfully." : (responseMessage || "Subscription updated successfully."),
             });
             // Redirect after a few seconds only on clean success
             setTimeout(() => navigate(returnPath), 3000);
          }
        } else {
          setStatus('failed');
          setMessage(response.data.error || "Payment verification failed.");
        }
      } catch (error: any) {
        console.error("Verification error:", error);
        setStatus('failed');
        setMessage(error.response?.data?.error || "An error occurred while verifying payment.");
      }
    };

    verifyPayment();
  }, [location, navigate, toast, returnPath]);

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
            {status === 'failed' && "Payment Failed"}
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
        <CardContent>
          {status !== 'verifying' && (
            <Button onClick={() => navigate(returnPath)} className="mt-4">
              {returnPath === "/wallet" ? "Return to Wallet" : "Return to Subscription"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
