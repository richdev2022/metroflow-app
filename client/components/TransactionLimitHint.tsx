import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// TransactionLimitHint — dashboard banner for the business KYC tiers.
//
// Renders NOTHING while loading, on error, or for already-verified businesses
// (no clutter). For Non-Registered businesses it shows an amber limit banner
// with an upgrade CTA; while a KYC submission is pending it degrades to a soft
// info variant instead.
// ---------------------------------------------------------------------------

type LimitTriple = {
  singleTransactionLimit: number;
  dailyLimit: number;
  monthlyLimit: number;
};

type BusinessKycStatus = {
  business?: {
    id?: string;
    name?: string;
    registrationCategory?: "non_registered" | "registered" | string;
    isRegistered?: boolean;
  };
  latestSubmission?: {
    id?: string;
    status?: "pending" | "approved" | "rejected" | string;
    registrationTypeLabel?: string;
  } | null;
  limits?: {
    category?: string;
    isRegistered?: boolean;
    currency?: string;
    limits: LimitTriple;
    usage?: {
      usedToday?: number;
      usedThisMonth?: number;
      remainingToday?: number;
      remainingThisMonth?: number;
    };
    registeredLimits?: LimitTriple;
  };
  canUpgrade?: boolean;
};

const ngn = (v: unknown) => `₦${(Number(v) || 0).toLocaleString()}`;

export default function TransactionLimitHint() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<BusinessKycStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get("/business-kyc/status");
        if (!cancelled) setStatus((res.data?.data || res.data) as BusinessKycStatus);
      } catch {
        // Silent: the banner is purely informational.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (!status) return null;

  const isRegistered =
    status.business?.isRegistered === true ||
    status.business?.registrationCategory === "registered" ||
    status.limits?.isRegistered === true;
  if (isRegistered) return null;

  const isPending = status.latestSubmission?.status === "pending";

  // Pending variant — soft info banner, no CTA.
  if (isPending) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-sky-300/70 bg-sky-50 p-4 shadow-sm dark:border-sky-500/40 dark:bg-sky-950/30">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
          <Clock className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-sky-900 dark:text-sky-200">
            Business verification under review
          </p>
          <p className="text-sm text-sky-800/90 dark:text-sky-300/90">
            We'll notify you once approved.
          </p>
        </div>
      </div>
    );
  }

  const limits = status.limits?.limits;
  const usage = status.limits?.usage;
  const registeredLimits =
    status.limits?.registeredLimits || null;
  if (!limits) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/70 bg-amber-50 p-4 shadow-sm sm:flex-row sm:items-center dark:border-amber-500/40 dark:bg-amber-950/30">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Transaction limit: {ngn(limits.singleTransactionLimit)} per transaction
          </p>
          <p className="text-sm text-amber-800/90 dark:text-amber-300/90">
            You're on the Non-Registered Business tier
            {usage && typeof usage.remainingToday === "number"
              ? ` — ${ngn(usage.remainingToday)} left today`
              : ""}
            . Upgrade to Registered Business (Verified) to unlock up to{" "}
            {registeredLimits ? ngn(registeredLimits.singleTransactionLimit) : "higher limits"} per
            transaction.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => navigate("/business-kyc")}
        className="shrink-0 gap-1.5 self-start bg-amber-600 text-white hover:bg-amber-700 sm:self-center"
      >
        Upgrade now <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
