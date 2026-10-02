import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

/**
 * 4-box numeric Transaction PIN entry — the single PIN input used across
 * Wallet / Payroll / Bills / Settings so every money flow looks and behaves
 * the same. Digits only (pattern-enforced), auto-advance, paste-friendly,
 * 4 slots.
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
  return (
    <InputOTP
      maxLength={4}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      value={value}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      containerClassName={className}
    >
      <InputOTPGroup className="gap-2">
        <InputOTPSlot index={0} className="h-11 w-11 rounded-lg border text-base first:rounded-l-lg" />
        <InputOTPSlot index={1} className="h-11 w-11 rounded-lg border text-base" />
        <InputOTPSlot index={2} className="h-11 w-11 rounded-lg border text-base" />
        <InputOTPSlot index={3} className="h-11 w-11 rounded-lg border text-base last:rounded-r-lg" />
      </InputOTPGroup>
    </InputOTP>
  );
}

export default PinInput;
