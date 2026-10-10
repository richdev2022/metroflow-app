import { api } from "@/lib/api-client";
import { unwrapApiData } from "@/lib/api-response";

/**
 * Refer & Earn — user-facing API layer.
 * Endpoints live on the backend at /referrals/* (see server/routes/referral.ts).
 */

export interface ReferralConfig {
  enabled: boolean;
  amount: number;
  currency: string;
}

export interface ReferralStats {
  totalReferred: number;
  subscribed: number;
  totalEarned: number;
  earnedCurrency: string;
}

export interface ReferredUser {
  id: string;
  name: string | null;
  email: string;
  joinedAt: string;
  businessName: string | null;
  planId: string | null;
  subscriptionCount: number;
  bonusAmount: number | null;
  bonusCurrency: string | null;
  bonusStatus: string | null;
  bonusPaidAt: string | null;
  status: "pending" | "subscribed" | "paid";
}

export interface ReferralInfo {
  referralCode: string | null;
  referralLink: string | null;
  hasReferrer: boolean;
  config: ReferralConfig;
  stats: ReferralStats;
  referred: ReferredUser[];
}

export interface PublicReferralConfig {
  enabled: boolean;
  amount: number;
  currency: string;
}

export interface ValidateReferralResponse {
  valid: boolean;
  referralEnabled: boolean;
  amount: number;
  currency: string;
}

export async function fetchReferralInfo(): Promise<ReferralInfo> {
  const response = await api.get("/referrals/me");
  return unwrapApiData<ReferralInfo>(response.data);
}

export async function fetchPublicReferralConfig(): Promise<PublicReferralConfig> {
  const response = await api.get("/referrals/public-config");
  return unwrapApiData<PublicReferralConfig>(response.data);
}

export async function validateReferralCode(code: string): Promise<ValidateReferralResponse> {
  const response = await api.get(
    `/referrals/validate/${encodeURIComponent(code.trim().toUpperCase())}`,
  );
  return unwrapApiData<ValidateReferralResponse>(response.data);
}

export async function claimReferralCode(
  code: string,
): Promise<{ applied: boolean; referrerName?: string | null; message?: string }> {
  const response = await api.post("/referrals/claim", { referralCode: code.trim().toUpperCase() });
  return unwrapApiData<{ applied: boolean; referrerName?: string | null; message?: string }>(
    response.data,
  );
}

/** Format a bonus amount with the configured currency symbol. */
export function formatReferralAmount(amount: number, currency = "NGN"): string {
  const symbols: Record<string, string> = { NGN: "₦", USD: "$", EUR: "€", GBP: "£" };
  const symbol = symbols[currency] || `${currency} `;
  return `${symbol}${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
