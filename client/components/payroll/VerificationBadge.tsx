import React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Clock3, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type VerificationStatus = "verified" | "unverified" | "pending" | "failed" | string | null | undefined;

interface VerificationBadgeProps {
  status: VerificationStatus;
  /** Resolved account name shown in the tooltip for verified employees */
  verifiedAccountName?: string | null;
  /** Optional lookup error message shown in the tooltip for failed employees */
  error?: string | null;
  className?: string;
}

/**
 * Verification badge with semantic colors:
 *  - green  Verified
 *  - amber  Pending / Unverified
 *  - red    Failed
 * The tooltip surfaces the verified account name (or failure reason).
 */
export function VerificationBadge({ status, verifiedAccountName, error, className }: VerificationBadgeProps) {
  const s = (status || "unverified").toLowerCase();

  const config =
    s === "verified"
      ? {
          label: "Verified",
          icon: CheckCircle2,
          className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10",
          tooltip: verifiedAccountName
            ? `Verified as "${verifiedAccountName}"`
            : "Recipient account name has been verified against the bank.",
        }
      : s === "failed"
        ? {
            label: "Failed",
            icon: XCircle,
            className: "bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/10",
            tooltip: error || "Account verification failed — update the bank details and verify again.",
          }
        : s === "pending"
          ? {
              label: "Pending",
              icon: Clock3,
              className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10",
              tooltip: "Verification is pending — run a verification to confirm the account name.",
            }
          : {
              label: "Pending",
              icon: HelpCircle,
              className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10",
              tooltip: "Not yet verified — the account name must be verified before salary payouts.",
            };

  const Icon = config.icon;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className={cn("gap-1 font-medium", config.className, className)}>
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          {config.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default VerificationBadge;
