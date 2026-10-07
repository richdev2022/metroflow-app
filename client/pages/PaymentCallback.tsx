import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, AlertTriangle, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CallbackStatus = 'verifying' | 'success' | 'failed' | 'warning' | 'cancelled';

// Payments settle asynchronously: a checkout that the provider reports as
// completed can still be unconfirmed on our first verify call. Poll a few
// times before falling back to the manual "Verify again" button.
const MAX_VERIFY_ATTEMPTS = 4;
const VERIFY_RETRY_DELAY_MS = 3000;
const SUCCESS_REDIRECT_DELAY_MS = 2500;

/** Extract the transaction reference from whichever query param the payment
 *  processor redirected with: some append `tx_ref`, some use
 *  `transaction_ref`/`ref`, our own backend redirects use `reference`. */
function extractReference(params: URLSearchParams): string | null {
  return (
    params.get("reference") ||
    params.get("paymentReference") ||
    params.get("tx_ref") ||
    params.get("transaction_ref") ||
    params.get("transactionRef") ||
    params.get("ref")
  );
}

/** Best-effort post-payment destination. An explicit same-origin path in the
 *  redirect query wins (redirect_to/return_to/redirect_url/next); otherwise
 *  the reference prefix tells us which feature originated the checkout. */
function resolveReturnPath(params: URLSearchParams, reference: string | null): string {
  const explicit =
    params.get("redirect_to") ||
    params.get("return_to") ||
    params.get("redirect_url") ||
    params.get("next");
  // Only allow in-app paths — never bounce to an off-site URL from a query param.
  if (explicit && explicit.startsWith("/") && !explicit.startsWith("//")) {
    return explicit;
  }
  if (reference?.startsWith("FUND-")) return "/wallet";
  if (reference?.startsWith("PL-")) return "/payment-links";
  if (reference?.startsWith("INVP-")) return "/invoices";
  if (reference?.startsWith("SUB-")) return "/subscriptions";
  return "/subscription";
}

const labelForReturnPath = (path: string) => {
  if (path.startsWith("/wallet")) return "Return to Wallet";
  if (path.startsWith("/payment-links")) return "Return to Payment Links";
  if (path.startsWith("/invoices")) return "Return to Invoices";
  if (path.startsWith("/subscriptions")) return "Return to Subscriptions";
  return "Return to Subscription";
};

type VerifyOutcome =
  | { kind: 'success'; message: string; responseMessage?: string }
  | { kind: 'warning'; message: string }
  | { kind: 'cancelled'; message: string }
  | { kind: 'pending'; message: string } // keep polling
  | { kind: 'failed'; message: string }; // definitive — stop polling

export default function PaymentCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<CallbackStatus>('verifying');
  const [message, setMessage] = useState("Verifying your payment…");
  const [returnPath, setReturnPath] = useState("/subscription");
  // Mirror of returnPath for use inside async callbacks (avoids stale closure
  // navigating to /subscription instead of /wallet on wallet-funding success).
  const returnPathRef = useRef("/subscription");
  // Guards against React StrictMode double-mounting the effect and replaying
  // the verification twice in a row (and against re-runs when returning from
  // a redirect that re-renders this route).
  const verifyingRef = useRef(false);
  const mountedRef = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const clearReturnPath = useCallback((path: string) => {
    setReturnPath(path);
    returnPathRef.current = path;
  }, []);

  /** One call to POST /subscription/verify-payment, classified into an outcome. */
  const verifyAttempt = useCallback(
    async (params: URLSearchParams): Promise<VerifyOutcome> => {
      const reference = extractReference(params);
      const preStatus = (params.get("status") || "").toLowerCase();
      const isWalletFunding = !!reference && reference.startsWith("FUND-");

      if (!reference) {
        return {
          kind: 'failed',
          message: "No transaction reference found. Please go back and start the payment again.",
        };
      }

      // ALWAYS re-verify server-side: the authoritative outcome comes from the
      // payment provider, not from redirect query params.
      try {
        const response = await api.post("/subscription/verify-payment", { reference });

        if (response.data?.success) {
          const responseMessage = response.data.message;
          // Check for warning conditions in the message
          if (responseMessage && (responseMessage.includes("card token not received") || responseMessage.includes("warning"))) {
            return { kind: 'warning', message: responseMessage };
          }
          const amount = response.data.amount != null ? Number(response.data.amount) : null;
          return {
            kind: 'success',
            message:
              amount && !Number.isNaN(amount)
                ? `${isWalletFunding ? "Wallet" : "Payment"} funded with ₦${amount.toLocaleString()} successfully!`
                : responseMessage || "Payment successful!",
            responseMessage,
          };
        }

        if (response.data?.cancelled) {
          return {
            kind: 'cancelled',
            message: response.data.message || "Payment cancelled — no money was deducted.",
          };
        }

        // No success/cancelled verdict yet — treat as still-pending so the
        // poll loop can retry (payments settle asynchronously).
        return {
          kind: 'pending',
          message:
            response.data?.error ||
            "We could not confirm your payment yet. If you were debited, it will reflect shortly.",
        };
      } catch (error: any) {
        console.error("Verification error:", error);

        // A transaction that does not exist can never verify — do not poll.
        if (error?.response?.status === 404) {
          return {
            kind: 'failed',
            message:
              error?.response?.data?.error ||
              "We could not find this transaction. Please go back and start the payment again.",
          };
        }

        // Fall back to the redirect-provided status when the re-verify call
        // itself fails (network/server hiccup) so the user still gets context.
        if (isWalletFunding && preStatus === 'cancelled') {
          return { kind: 'cancelled', message: "Payment cancelled — no money was deducted." };
        }
        if (isWalletFunding && preStatus === 'pending_settlement') {
          return {
            kind: 'warning',
            message: "We received your payment, but crediting your wallet is delayed. It will be retried automatically.",
          };
        }

        return {
          kind: 'pending',
          message:
            error?.response?.data?.error ||
            "An error occurred while verifying your payment.",
        };
      }
    },
    [],
  );

  const applyOutcome = useCallback(
    (outcome: VerifyOutcome, isWalletFunding: boolean) => {
      if (!mountedRef.current) return;
      switch (outcome.kind) {
        case 'success':
          setStatus('success');
          setMessage(outcome.message);
          toast({
            title: "Success",
            description: isWalletFunding
              ? "Wallet funded successfully."
              : outcome.responseMessage || "Payment verified successfully.",
          });
          // Auto-return to the app after a short pause on clean success
          redirectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) navigate(returnPathRef.current);
          }, SUCCESS_REDIRECT_DELAY_MS);
          break;
        case 'warning':
          setStatus('warning');
          setMessage(outcome.message);
          toast({
            title: "Attention Needed",
            description: outcome.message,
            variant: "default",
            className: "border-yellow-500",
          });
          // Do not auto-redirect on warning
          break;
        case 'cancelled':
          setStatus('cancelled');
          setMessage(outcome.message);
          toast({ title: "Payment cancelled", description: "No money was deducted." });
          break;
        case 'failed':
          setStatus('failed');
          setMessage(outcome.message);
          break;
        default:
          break;
      }
    },
    [navigate, toast],
  );

  const verify = useCallback(
    async (params: URLSearchParams, toastFn: typeof toast) => {
      const reference = extractReference(params);
      const isWalletFunding = !!reference && reference.startsWith("FUND-");

      // A fresh token may accompany the redirect (session can lapse during checkout)
      const freshToken = params.get("token");
      if (freshToken) {
        try { localStorage.setItem("token", freshToken); } catch { /* ignore */ }
      }

      clearReturnPath(resolveReturnPath(params, reference));

      setStatus('verifying');
      setMessage("Verifying your payment…");

      // Up to MAX_VERIFY_ATTEMPTS calls, VERIFY_RETRY_DELAY_MS apart, while
      // the payment is still settling ("pending"). Any definitive outcome
      // (success / warning / cancelled / hard failure) stops the loop.
      let lastPending: string | null = null;
      for (let attempt = 1; attempt <= MAX_VERIFY_ATTEMPTS; attempt++) {
        if (!mountedRef.current) return;
        const outcome = await verifyAttempt(params);
        if (outcome.kind !== 'pending') {
          applyOutcome(outcome, isWalletFunding);
          return;
        }
        lastPending = outcome.message;
        if (attempt < MAX_VERIFY_ATTEMPTS) {
          setMessage(
            `Still confirming your payment… (attempt ${attempt + 1} of ${MAX_VERIFY_ATTEMPTS})`,
          );
          await new Promise<void>((resolve) => {
            retryTimerRef.current = setTimeout(resolve, VERIFY_RETRY_DELAY_MS);
          });
        }
      }

      // Attempts exhausted — surface the last pending message as a failure
      // with the manual "Verify again" button.
      if (!mountedRef.current) return;
      setStatus('failed');
      setMessage(
        `${lastPending || "We could not confirm your payment."} We tried ${MAX_VERIFY_ATTEMPTS} times — if you were debited, the payment may still settle; please verify again shortly.`,
      );
    },
    [applyOutcome, clearReturnPath, verifyAttempt],
  );

  useEffect(() => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    const params = new URLSearchParams(location.search);
    verify(params, toast);
  }, [location, verify, toast]);

  const retry = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setStatus('verifying');
    setMessage("Verifying your payment…");
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
            <Button onClick={retry} className="mt-4">Verify again</Button>
          )}
          {status !== 'verifying' && (
            <Button
              variant={status === 'failed' ? "outline" : "default"}
              onClick={() => navigate(returnPath)}
              className={status === 'failed' ? "" : "mt-4"}
            >
              {labelForReturnPath(returnPath)}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
