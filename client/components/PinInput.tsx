import { useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Eye, EyeOff } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

/**
 * 4-box numeric Transaction PIN entry — the single PIN input used across
 * Wallet / Payroll / Bills / Settings so every money flow looks and behaves
 * the same. Digits only (pattern-enforced), auto-advance, paste-friendly,
 * 4 slots.
 *
 * Privacy: digits are masked by default; a small eye button beside the boxes
 * reveals/hides them. Masking uses input-otp's native `obscure` prop — the
 * shadcn wrapper spreads unknown props straight onto <OTPInput> — so paste,
 * auto-advance and the caret keep working untouched (•••• with the last
 * typed digit briefly visible, like a real bank app).
 */
export function PinInput({
  value,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel = "Transaction PIN",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <InputOTP
        maxLength={4}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        obscure={!show}
      >
        <InputOTPGroup className="gap-2">
          <InputOTPSlot index={0} className="h-11 w-11 rounded-lg border text-base first:rounded-l-lg" />
          <InputOTPSlot index={1} className="h-11 w-11 rounded-lg border text-base" />
          <InputOTPSlot index={2} className="h-11 w-11 rounded-lg border text-base" />
          <InputOTPSlot index={3} className="h-11 w-11 rounded-lg border text-base last:rounded-r-lg" />
        </InputOTPGroup>
      </InputOTP>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        disabled={disabled}
        aria-label={show ? "Hide PIN" : "Show PIN"}
        title={show ? "Hide PIN" : "Show PIN"}
        aria-pressed={show}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {/* Same convention as the balance-privacy toggle: EyeOff = masked. */}
        {show ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default PinInput;
