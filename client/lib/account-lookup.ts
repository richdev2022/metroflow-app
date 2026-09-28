import { api } from "@/lib/api-client";

/**
 * Robustly extracts the resolved account name from an account-lookup response.
 *
 * The provider envelope differs per active transfer provider:
 *  - Flutterwave (nested): { success, data: { status, message, data: { account_number, account_name } } }
 *  - Squad:                { success, data: { responseBody: { accountName, ... } } }
 *  - Flat shapes:          { success, data: { account_name | accountName } }
 *
 * Always defensive: returns "" when nothing resolvable is present.
 */
export function extractAccountName(payload: any): string {
  const data = payload?.data;
  return (
    data?.data?.account_name ||
    data?.data?.accountName ||
    data?.responseBody?.accountName ||
    data?.responseBody?.account_name ||
    data?.account_name ||
    data?.accountName ||
    ""
  );
}

/** Calls POST /transfers/account-lookup and returns the resolved account name. */
export async function lookupAccountName(bankCode: string, accountNumber: string): Promise<string> {
  const res = await api.post("/transfers/account-lookup", {
    bank_code: bankCode,
    account_number: accountNumber,
  });
  return extractAccountName(res.data);
}
