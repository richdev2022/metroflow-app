import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PaymentCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed' | 'warning'>('verifying');
  const [message, setMessage] = useState("Verifying your payment...");

  useEffect(() => {
    const verifyPayment = async () => {
      const searchParams = new URLSearchParams(location.search);
      const reference = searchParams.get("reference"); // Squad appends ?reference=...

      if (!reference) {
        setStatus('failed');
        setMessage("No transaction reference found.");
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
             setMessage(responseMessage || "Payment successful! Your subscription has been updated.");
             toast({
               title: "Success",
               description: responseMessage || "Subscription updated successfully.",
             });
             // Redirect after a few seconds only on clean success
             setTimeout(() => navigate("/subscription"), 3000);
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
  }, [location, navigate, toast]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            {status === 'verifying' && <Loader2 className="h-12 w-12 animate-spin text-primary" />}
            {status === 'success' && <CheckCircle className="h-12 w-12 text-green-500" />}
            {status === 'failed' && <XCircle className="h-12 w-12 text-red-500" />}
            {status === 'warning' && <AlertTriangle className="h-12 w-12 text-yellow-500" />}
          </div>
          <CardTitle>
            {status === 'verifying' && "Verifying Payment"}
            {status === 'success' && "Payment Successful"}
            {status === 'failed' && "Payment Failed"}
            {status === 'warning' && "Payment Verified with Issues"}
          </CardTitle>
          <CardDescription className={status === 'warning' ? "text-yellow-600 dark:text-yellow-400 font-medium mt-2" : "mt-2"}>
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status !== 'verifying' && (
            <Button onClick={() => navigate("/subscription")} className="mt-4">
              Return to Subscription
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
