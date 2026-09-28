import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type DeltaTone = "up" | "down" | "neutral";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  /** Tone classes for the icon chip, e.g. "bg-emerald-500/10 text-emerald-600" */
  iconClassName?: string;
  delta?: React.ReactNode;
  deltaTone?: DeltaTone;
  /** Optional footer content rendered under a subtle divider */
  footer?: React.ReactNode;
  className?: string;
}

const deltaToneClasses: Record<DeltaTone, string> = {
  up: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  down: "bg-red-500/10 text-red-600 dark:text-red-400",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * Refined KPI stat card: soft gradient wash, icon chip, big value,
 * delta pill and an optional footer. Layered shadows + hover lift.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  delta,
  deltaTone = "neutral",
  footer,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className
      )}
    >
      {/* Soft corner gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                deltaToneClasses[deltaTone]
              )}
            >
              {delta}
            </span>
          )}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary",
            iconClassName
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      {footer && (
        <div className="relative mt-4 border-t border-border/60 pt-3 text-sm text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}

export default StatCard;
