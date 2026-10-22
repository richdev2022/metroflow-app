import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { maskAmount, useBalanceHidden } from "@/lib/balance-visibility";

/**
 * Balance privacy primitives — shared by every surface that displays a
 * wallet balance (home cards, wallet page, savings vaults, virtual cards,
 * stablecoin hub, dashboard strip). One tap on ANY toggle hides every
 * balance in the app; the state is global and persisted (see
 * lib/balance-visibility.ts).
 */

export function BalanceToggle({
  className,
  tone = "default",
}: {
  className?: string;
  /** "onBrand" = sits on a saturated gradient card (white glass chip). */
  tone?: "default" | "onBrand";
}) {
  const [hidden, toggle] = useBalanceHidden();
  const Icon = hidden ? EyeOff : Eye;
  const label = hidden ? "Show balances" : "Hide balances";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={hidden}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "onBrand"
          ? "bg-white/15 text-white backdrop-blur hover:bg-white/25"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/**
 * Renders a pre-formatted amount, masking digits while balances are hidden.
 * Pass the exact string you would have rendered.
 */
export function PrivateAmount({ value, className }: { value: string; className?: string }) {
  const [hidden] = useBalanceHidden();
  return <span className={className}>{hidden ? maskAmount(value) : value}</span>;
}
