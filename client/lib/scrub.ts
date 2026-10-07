/**
 * Provider-name scrubbing for user-visible strings.
 *
 * Failure reasons and status messages sometimes echo the underlying payment
 * processor's name (reported verbatim by the processing API). Customer-facing
 * surfaces must never expose which processor is behind a payout, so every
 * user-visible failureReason / status message is passed through
 * scrubProviderNames() before rendering (tables, dialogs, PDF receipts).
 *
 * Rules:
 *  - Case-insensitive, word-boundary match, so "Korapay" (a real bank-ish
 *    name fragment) or "Providence" are NOT touched, while "FLW", "Squad",
 *    "flutterwave" (any case) are replaced.
 *  - Replacement is neutral: "the payment processor".
 */

const SCRUB_RE =
  /\b(flutterwave|monnify|squad|providus|paystack|kora|barter|flw)\b/gi;

export const SCRUB_REPLACEMENT = "the payment processor";

/** Replace payment-processor names with neutral wording. */
export function scrubProviderNames(text: string | null | undefined): string {
  if (text === null || text === undefined) return "";
  return String(text).replace(SCRUB_RE, SCRUB_REPLACEMENT);
}

/**
 * Scrub + humanize a provider error: trims, collapses whitespace and strips
 * trailing periods so the toast/detail text reads cleanly.
 */
export function scrubProviderMessage(text: string | null | undefined): string {
  return scrubProviderNames(String(text || ""))
    .replace(/\s+/g, " ")
    .trim();
}
