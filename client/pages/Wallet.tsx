import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { unwrapApiData } from "@/lib/api-response";
import { WalletInfo, FundWalletInput, CreateVirtualAccountInput, OtpEnabledResponse, TransferQuote, TransferBeneficiary } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Wallet as WalletIcon, Building2, CreditCard, ArrowRightLeft, RefreshCw, AlertCircle, CheckCircle2, Timer, ClockAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { lookupAccountName } from "@/lib/account-lookup";
import WalletTransactions from "@/components/wallet/WalletTransactions";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useCountdown } from "@/hooks/useCountdown";
import PinInput from "@/components/PinInput";

const fundWalletSchema = z.object({
  amount: z.string().min(1, "Amount is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Amount must be greater than 0"),
});

const transferSchema = z.object({
  wallet_id: z.string().min(1, "Source wallet is required"),
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]),
  bankCode: z.string().min(1, "Bank is required"),
  accountNumber: z.string().min(1, "Account number is required"),
  accountName: z.string().min(3, "Account name is required"),
  amount: z.string().min(1, "Amount is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Amount must be greater than 0"),
  remark: z.string().optional(),
  // International payout beneficiary details (all supported rails)
  bankName: z.string().optional(),
  swiftCode: z.string().optional(),
  routingNumber: z.string().optional(),
  accountType: z.string().optional(),
  recipientAddress: z.string().optional(),
  recipientCity: z.string().optional(),
  recipientState: z.string().optional(),
  recipientPostalCode: z.string().optional(),
  recipientCountry: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.currency === "NGN" && !/^\d{10}$/.test(data.accountNumber)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["accountNumber"],
      message: "Account number must be 10 digits",
    });
  }
  if (data.currency === "USD") {
    // USD contract (Flutterwave intl docs): ABA routing number, bank name,
    // street address, account_type checking|depository.
    const required: Array<[keyof typeof data, string]> = [
      ["recipientCountry", "Recipient country is required for international payouts"],
      ["recipientAddress", "Street address is required for international payouts"],
      ["recipientCity", "City is required for international payouts"],
      ["bankName", "Bank name is required for international payouts"],
      ["routingNumber", "US routing number (ABA) is required for USD payouts"],
    ];
    for (const [path, message] of required) {
      if (!String(data[path] || "").trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      }
    }
    if (data.routingNumber && !/^\d{9}$/.test(data.routingNumber.replace(/[\s-]/g, ""))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["routingNumber"], message: "US routing number must be 9 digits" });
    }
    const usdType = (data.accountType || "checking").toLowerCase();
    if (!["checking", "depository"].includes(usdType)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountType"], message: 'USD account type must be "checking" or "depository"' });
    }
  }
  if (data.currency === "GBP") {
    // GBP contract: routing_number = UK sort code (6 digits) OR BIC/SWIFT;
    // the European address block (street, city, postcode) is required.
    const required: Array<[keyof typeof data, string]> = [
      ["recipientCountry", "Recipient country is required for international payouts"],
      ["recipientAddress", "Street address is required for international payouts"],
      ["recipientCity", "City is required for international payouts"],
      ["recipientPostalCode", "Postal code is required for international payouts"],
      ["bankName", "Bank name is required for international payouts"],
      ["routingNumber", "UK sort code (6 digits) or BIC is required for GBP payouts"],
    ];
    for (const [path, message] of required) {
      if (!String(data[path] || "").trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      }
    }
    const routingClean = (data.routingNumber || "").replace(/[\s-]/g, "");
    const isSortCode = /^\d{6}$/.test(routingClean);
    const isBic = /^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{3})?$/.test(routingClean) && /[A-Za-z]/.test(routingClean);
    if (data.routingNumber && !isSortCode && !isBic) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["routingNumber"], message: "UK sort code must be 6 digits (e.g. 308463), or an 8/11-character BIC" });
    }
  }
  if (data.currency === "EUR") {
    // EUR contract: account_number = IBAN, BIC routing, and the European
    // address block (street, city REQUIRED, postcode).
    const required: Array<[keyof typeof data, string]> = [
      ["recipientCountry", "Recipient country is required for international payouts"],
      ["recipientAddress", "Street address is required for international payouts"],
      ["recipientCity", "City is required for international payouts"],
      ["recipientPostalCode", "Postal code is required for international payouts"],
      ["bankName", "Bank name is required for international payouts"],
      ["swiftCode", "SWIFT/BIC code is required for EUR payouts"],
    ];
    for (const [path, message] of required) {
      if (!String(data[path] || "").trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      }
    }
    if (data.swiftCode && !/^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{3})?$/.test(data.swiftCode.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["swiftCode"], message: "SWIFT/BIC must be 8 or 11 characters" });
    }
  }
});

// Supported international payout currencies
const INTL_CURRENCIES = ["USD", "GBP", "EUR"] as const;
const isIntlCurrency = (c: string | undefined) => !!c && (INTL_CURRENCIES as readonly string[]).includes(c);

// Common international USD/GBP payout corridors (ISO-3166-1 alpha-2)
const INTL_PAYOUT_COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "IE", name: "Ireland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "PT", name: "Portugal" },
  { code: "FI", name: "Finland" },
  { code: "GR", name: "Greece" },
  { code: "LU", name: "Luxembourg" },
  { code: "KE", name: "Kenya" },
  { code: "GH", name: "Ghana" },
  { code: "ZA", name: "South Africa" },
  { code: "TZ", name: "Tanzania" },
  { code: "UG", name: "Uganda" },
  { code: "RW", name: "Rwanda" },
];

export default function Wallet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentNotice, setPaymentNotice] = useState<{
    kind: "cancelled" | "pending" | "success";
    title: string;
    message: string;
  } | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fundingLoading, setFundingLoading] = useState(false);
  const [creatingVaLoading, setCreatingVaLoading] = useState<string | null>(null); // Track which wallet we're creating VA for
  const { toast } = useToast();
  const [fundWalletOpen, setFundWalletOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedWalletType, setSelectedWalletType] = useState<"user" | "business">("user");
  /** Owner/admin only — invited members must never see the business wallet. */
  const canManageBusinessWallet = walletInfo?.canManageBusinessWallet ?? false;
  const [bankOpen, setBankOpen] = useState(false);

  // Transfer State
  const [transferStep, setTransferStep] = useState<"details" | "otp">("details");
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [lookupName, setLookupName] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteConfirmed, setQuoteConfirmed] = useState(false);
  // Admin-configured international payout limits (min/max per currency) —
  // surfaced as a hint under the amount field BEFORE any quote exists.
  const [payoutLimits, setPayoutLimits] = useState<Record<string, { min: number; max: number }>>({});
  // Recent beneficiaries for the SELECTED currency (fetched when the currency
  // tab changes) — one-tap fill for both local NGN and global USD/GBP/EUR.
  const [beneficiaries, setBeneficiaries] = useState<TransferBeneficiary[]>([]);
  // Quote lock window: epoch-ms deadline from the backend's expires_at /
  // expires_in_seconds (null when the backend didn't stamp an expiry).
  const [quoteExpiresAt, setQuoteExpiresAt] = useState<number | null>(null);
  // Ticked once per second while a quote is live — drives the mm:ss chip.
  const [quoteNow, setQuoteNow] = useState(Date.now());
  const [otpLoading, setOtpLoading] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [otpMethod, setOtpMethod] = useState<string>("");
  const [otpEnabled, setOtpEnabled] = useState(true);
  const [pinCreated, setPinCreated] = useState(false);
  const [showCreatePinModal, setShowCreatePinModal] = useState(false);
  const [showResetPinModal, setShowResetPinModal] = useState(false);
  const [resetPinOtp, setResetPinOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [showTransferSuccessModal, setShowTransferSuccessModal] = useState(false);
  const [successfulTransfer, setSuccessfulTransfer] = useState<any>(null);
  const [transactionsRefreshKey, setTransactionsRefreshKey] = useState(0);
  const { seconds, isActive, startCountdown } = useCountdown();

  const fundForm = useForm<z.infer<typeof fundWalletSchema>>({
    resolver: zodResolver(fundWalletSchema),
    defaultValues: { amount: "" },
  });

  const transferForm = useForm<z.infer<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      wallet_id: "",
      currency: "NGN",
      bankCode: "",
      accountNumber: "",
      accountName: "",
      amount: "",
      remark: "",
      bankName: "",
      swiftCode: "",
      routingNumber: "",
      accountType: "",
      recipientAddress: "",
      recipientCity: "",
      recipientState: "",
      recipientPostalCode: "",
      recipientCountry: "US",
    },
  });

  const watchedCurrency = transferForm.watch("currency");
  const watchedAmount = transferForm.watch("amount");

  // ---- International payout: address autofill (OpenStreetMap Nominatim) ----
  // As the user picks the recipient country and types the street address,
  // debounced queries suggest matching addresses and fill city/state/postcode.
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [addressSuggestOpen, setAddressSuggestOpen] = useState(false);
  const [addressSearching, setAddressSearching] = useState(false);
  const addressPickLockRef = useRef(false);
  const watchedRecipientAddress = transferForm.watch("recipientAddress");
  const watchedRecipientCountry = transferForm.watch("recipientCountry");

  useEffect(() => {
    if (!isIntlCurrency(watchedCurrency)) { setAddressSuggestOpen(false); return; }
    const q = (watchedRecipientAddress || "").trim();
    const cc = (watchedRecipientCountry || "").toLowerCase();
    // Skip lookups right after a suggestion was picked (value just changed).
    if (q.length < 3 || !cc || addressPickLockRef.current) {
      setAddressSuggestOpen(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setAddressSearching(true);
      try {
        // Backend /geo/address-suggest proxy: direct browser fetches to
        // Nominatim carry the browser UA and get 503 (empty results) — the
        // proxy sends the identified app UA instead.
        const res = await api.get("/geo/address-suggest", { params: { q, cc } });
        const rows = unwrapApiData<any[]>(res.data, "") || [];
        setAddressSuggestions(Array.isArray(rows) ? rows : []);
        setAddressSuggestOpen(Array.isArray(rows) && rows.length > 0);
      } catch {
        setAddressSuggestions([]);
        setAddressSuggestOpen(false);
      } finally {
        setAddressSearching(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [watchedRecipientAddress, watchedRecipientCountry, watchedCurrency]);

  const pickAddressSuggestion = (item: any) => {
    const a = item?.address || {};
    addressPickLockRef.current = true;
    const street =
      [a.house_number, a.road].filter(Boolean).join(" ") ||
      item?.name ||
      String(item?.display_name || "").split(",")[0] ||
      "";
    transferForm.setValue("recipientAddress", street, { shouldValidate: true });
    transferForm.setValue(
      "recipientCity",
      a.city || a.town || a.village || a.suburb || a.county || "",
      { shouldValidate: true }
    );
    transferForm.setValue("recipientState", a.state || "", { shouldValidate: false });
    transferForm.setValue("recipientPostalCode", a.postcode || "", { shouldValidate: true });
    setAddressSuggestOpen(false);
    window.setTimeout(() => { addressPickLockRef.current = false; }, 500);
  };

  // Checkout outcome: the backend verify page redirects here with
  // ?status=success|cancelled|pending_settlement&reference=...&token=...
  useEffect(() => {
    const status = searchParams.get("status");
    const reference = searchParams.get("reference") || searchParams.get("paymentReference");
    if (!status) return;

    if (status === "cancelled") {
      setPaymentNotice({
        kind: "cancelled",
        title: "Payment cancelled",
        message: reference
          ? `Payment cancelled — no money was deducted. Reference: ${reference}`
          : "Payment cancelled — no money was deducted.",
      });
      toast({ title: "Payment cancelled", description: "No money was deducted." });
    } else if (status === "pending_settlement") {
      setPaymentNotice({
        kind: "pending",
        title: "Payment pending settlement",
        message: "We received your payment, but crediting your wallet is delayed. It will be retried automatically.",
      });
    } else if (status === "success") {
      setPaymentNotice({
        kind: "success",
        title: "Payment successful",
        message: "Your wallet has been funded successfully.",
      });
    }

    // Clean the URL so refresh/back doesn't replay the banner
    searchParams.delete("status");
    searchParams.delete("reference");
    searchParams.delete("paymentReference");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch Banks
  useEffect(() => {
    if (transferOpen) {
      const fetchBanks = async () => {
        try {
          const response = await api.get("/transfers/banks");
          setBanks(response.data.data);
        } catch (error) {
          console.error("Failed to fetch banks", error);
        }
      };
      fetchBanks();
    }
  }, [transferOpen]);

  // Account Lookup
  const handleAccountLookup = async (accountNumber: string, bankCode: string) => {
    if (accountNumber.length === 10 && bankCode) {
      try {
        setLookupLoading(true);
        setLookupError(null);
        setLookupName(null);
        transferForm.setValue("accountName", "");

        const name = await lookupAccountName(bankCode, accountNumber);
        setLookupName(name);
        transferForm.setValue("accountName", name);
      } catch (error: any) {
        setLookupName(null);
        setLookupError(error.response?.data?.error || error.response?.data?.message || "Could not verify account name");
        transferForm.setValue("accountName", "");
      } finally {
        setLookupLoading(false);
      }
    }
  };
  
  // Watch for account number and bank code changes
  const watchedAccountNumber = transferForm.watch("accountNumber");
  const watchedBankCode = transferForm.watch("bankCode");

  /**
   * Exact bank+account pair just prefilled from a saved beneficiary (NGN).
   * While it matches, the account-lookup effect skips the provider re-resolve
   * so the prefilled (already verified) name can't be wiped by a transient
   * lookup failure. Any manual edit to bank or account invalidates the key.
   */
  const beneficiaryPrefillRef = useRef<string | null>(null);

  // Keep the payout rail consistent with the selected currency: USD exposes
  // the ACH/SWIFT picker; GBP (sort codes) and EUR (SWIFT/IBAN) always ride
  // the SWIFT rail — the field is hidden for them and auto-set here.
  useEffect(() => {
    if (watchedCurrency === "GBP" || watchedCurrency === "EUR") {
      if (transferForm.getValues("bankCode") !== "SWIFT") {
        transferForm.setValue("bankCode", "SWIFT");
      }
    } else if (watchedCurrency === "USD") {
      const cur = transferForm.getValues("bankCode");
      if (cur !== "ACH" && cur !== "SWIFT") {
        transferForm.setValue("bankCode", "ACH");
      }
    }
  }, [watchedCurrency, transferForm]);
  
  useEffect(() => {
      // NGN-only: nigerian banks support provider account-name lookup.
      // International beneficiaries are entered manually (no local lookup).
      if (isIntlCurrency(watchedCurrency)) return;
      if (watchedAccountNumber?.length === 10 && watchedBankCode) {
          // Skip the re-resolve for a just-prefilled saved beneficiary.
          if (
            beneficiaryPrefillRef.current === `${watchedBankCode}:${watchedAccountNumber}` &&
            transferForm.getValues("accountName")
          ) {
            return;
          }
          handleAccountLookup(watchedAccountNumber, watchedBankCode);
      } else {
          setLookupName(null);
          setLookupError(null);
          if (!watchedAccountNumber || !watchedBankCode) {
               transferForm.setValue("accountName", "");
          }
      }
  }, [watchedAccountNumber, watchedBankCode, watchedCurrency]);

// International payout quote (USD/GBP/EUR transfers): live FX rate with the
// platform margin baked in, plus fees. Customers see Conversion rate / Fee /
// Total only.
const loadQuote = useCallback(async (amountNum: number, currency: string) => {
    try {
      setQuoteLoading(true);
      setQuoteError(null);
      const res = await api.get(
        `/transfers/quote?amount=${amountNum}&source_currency=NGN&destination_currency=${currency}`
      );
      if (res.data?.success && res.data?.data) {
        const freshQuote: TransferQuote = res.data.data;
        setQuote(freshQuote);
        setQuoteConfirmed(false);
        // Fresh quote → (re)start the lock countdown from the server deadline.
        const ttl = Number(freshQuote.expires_in_seconds);
        setQuoteExpiresAt(
          freshQuote.expires_at
            ? new Date(freshQuote.expires_at).getTime()
            : Number.isFinite(ttl) && ttl > 0
              ? Date.now() + ttl * 1000
              : null,
        );
      } else {
        setQuote(null);
        setQuoteExpiresAt(null);
        setQuoteError(res.data?.error || "Could not fetch a quote right now");
      }
    } catch (e: any) {
      setQuote(null);
      setQuoteExpiresAt(null);
      setQuoteError(
        e.response?.data?.error || "Could not fetch a quote — international payouts may be unavailable"
      );
    } finally {
      setQuoteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isIntlCurrency(watchedCurrency)) {
      setQuote(null);
      setQuoteError(null);
      setQuoteConfirmed(false);
      setQuoteExpiresAt(null);
      return;
    }
    const amountNum = Number(watchedAmount);
    if (!watchedAmount || isNaN(amountNum) || amountNum <= 0) {
      setQuote(null);
      setQuoteError(null);
      setQuoteConfirmed(false);
      setQuoteExpiresAt(null);
      return;
    }
    const timer = setTimeout(() => {
      loadQuote(amountNum, watchedCurrency);
    }, 500);
    return () => clearTimeout(timer);
  }, [watchedCurrency, watchedAmount, loadQuote]);

  // Live countdown tick — one interval per active quote, cleaned up on
  // unmount and whenever the quote (or its deadline) changes.
  useEffect(() => {
    if (!quote || quoteExpiresAt == null) return;
    setQuoteNow(Date.now());
    const interval = window.setInterval(() => setQuoteNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [quote, quoteExpiresAt]);

  const quoteRemainingSeconds =
    quote && quoteExpiresAt != null
      ? Math.max(0, Math.ceil((quoteExpiresAt - quoteNow) / 1000))
      : null;
  const quoteExpired = !!quote && quoteExpiresAt != null && quoteRemainingSeconds === 0;
  const quoteCountdown =
    quoteRemainingSeconds != null
      ? `${Math.floor(quoteRemainingSeconds / 60)}:${String(quoteRemainingSeconds % 60).padStart(2, "0")}`
      : null;

  // A lapsed quote can no longer be confirmed — drop the confirmation flag
  // so the submit gate (which checks quoteConfirmed) blocks the transfer.
  useEffect(() => {
    if (quoteExpired) setQuoteConfirmed(false);
  }, [quoteExpired]);

  /** Submit-time guard: the render-time chip can lag the wall clock by up to
   *  1s, so the handlers re-check against the actual deadline. */
  const isQuoteExpiredNow = useCallback(
    () => !!quote && quoteExpiresAt != null && Date.now() >= quoteExpiresAt,
    [quote, quoteExpiresAt],
  );

  /** "Refresh quote" — re-runs the quote fetch immediately (no debounce). */
  const handleRefreshQuote = useCallback(() => {
    const amountNum = Number(watchedAmount);
    if (!amountNum || isNaN(amountNum) || amountNum <= 0) return;
    loadQuote(amountNum, watchedCurrency);
  }, [watchedAmount, watchedCurrency, loadQuote]);

  // ---- Admin-configured payout limits (hint under the amount field) +
  // ---- recent beneficiaries for the selected currency.
  useEffect(() => {
    let cancelled = false;
    api.get("/transfers/payout-limits")
      .then((res) => {
        if (!cancelled && res.data?.success && res.data?.data?.limits) {
          setPayoutLimits(res.data.data.limits);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get(`/transfers/beneficiaries?currency=${watchedCurrency}&limit=20`)
      .then((res) => {
        if (!cancelled && res.data?.success && Array.isArray(res.data?.data)) {
          setBeneficiaries(res.data.data);
        } else if (!cancelled) {
          setBeneficiaries([]);
        }
      })
      .catch(() => { if (!cancelled) setBeneficiaries([]); });
    return () => { cancelled = true; };
  }, [watchedCurrency]);

  /** One-tap fill from a saved beneficiary — prefills EVERY payout field. */
  const applyBeneficiary = useCallback((b: TransferBeneficiary) => {
    transferForm.setValue("accountNumber", b.accountNumber || "");
    transferForm.setValue("accountName", b.accountName || "");
    transferForm.setValue("bankName", b.bankName || "");
    transferForm.setValue("routingNumber", b.routingNumber || "");
    transferForm.setValue("swiftCode", b.swiftCode || "");
    transferForm.setValue("accountType", b.accountType || "");
    transferForm.setValue("recipientAddress", b.address || "");
    transferForm.setValue("recipientCity", b.city || "");
    transferForm.setValue("recipientState", b.state || "");
    transferForm.setValue("recipientPostalCode", b.postalCode || "");
    if (isIntlCurrency(watchedCurrency)) {
      // Country: saved value, else the corridor default (mirrors the
      // beneficiary dialog defaults).
      transferForm.setValue(
        "recipientCountry",
        b.recipientCountry || (watchedCurrency === "GBP" ? "GB" : watchedCurrency === "EUR" ? "DE" : "US"),
      );
      if (watchedCurrency === "USD") {
        // USD rail auto-pick: a saved SWIFT code → SWIFT wire; else a 9-digit
        // ABA routing number → ACH (the ACH form hides the SWIFT field, so
        // leaving the rail wrong would silently drop the routing/WIRE data).
        const rail = String(b.swiftCode || "").trim()
          ? "SWIFT"
          : /^\d{9}$/.test(String(b.routingNumber || "").replace(/[\s-]/g, ""))
            ? "ACH"
            : transferForm.getValues("bankCode") || "ACH";
        transferForm.setValue("bankCode", rail);
      }
      // GBP/EUR keep the SWIFT rail the currency effect auto-sets.
      beneficiaryPrefillRef.current = null;
    } else {
      transferForm.setValue("bankCode", b.bankCode || "");
      setLookupName(b.accountName || null);
      setLookupError(null);
      // Mark this exact bank+account as beneficiary-verified so the NGN
      // account-lookup effect doesn't immediately re-resolve (and potentially
      // wipe) the prefilled name on a transient lookup failure.
      beneficiaryPrefillRef.current = `${b.bankCode || ""}:${b.accountNumber || ""}`;
    }
  }, [transferForm, watchedCurrency]);

  const onInitiateTransfer = async (values: z.infer<typeof transferSchema>) => {
     if (!pin || pin.length !== 4) {
          toast({
              title: "Error",
              description: "Please enter your 4-digit transaction PIN",
              variant: "destructive"
          });
          return;
      }

      if (otpEnabled) {
        try {
          setOtpLoading(true);
          const requestData: any = {
              wallet_id: values.wallet_id
          };
          if (otpMethod) {
              requestData.otp_method = otpMethod;
          }
          await api.post("/transfers/otp/request", requestData);
          setTransferStep("otp");
          toast({
              title: "OTP Sent",
              description: "Please enter the OTP sent to you",
          });
        } catch (error: any) {
          toast({
            title: "Error",
            description: error.response?.data?.error || error.response?.data?.message || "Failed to request OTP",
            variant: "destructive"
          });
        } finally {
            setOtpLoading(false);
        }
      } else {
        // If OTP is disabled, just submit the transfer with PIN only
        onFinalizeTransferWithoutOTP();
      }
  };
  
  const onFinalizeTransfer = async () => {
      if (!pin || pin.length !== 4) {
          toast({
              title: "Error",
              description: "Please enter your 4-digit transaction PIN",
              variant: "destructive"
          });
          return;
      }
      if (otpEnabled && (!otp || otp.length < 4)) {
          toast({
              title: "Error",
              description: "Please enter a valid OTP",
              variant: "destructive"
          });
          return;
      }
      const values = transferForm.getValues();
      if (isIntlCurrency(values.currency) && isQuoteExpiredNow()) {
          toast({
              title: "Quote expired",
              description: "Your exchange-rate quote has expired. Refresh the quote and confirm the new rate before sending.",
              variant: "destructive"
          });
          return;
      }
      if (isIntlCurrency(values.currency) && (!quote || !quoteConfirmed)) {
          toast({
              title: "Quote confirmation required",
              description: "Please review and confirm the exchange rate quote before sending.",
              variant: "destructive"
          });
          return;
      }
      
      try {
          setTransferLoading(true);
          
          const payload: any = {
              bankCode: values.bankCode,
              accountNumber: values.accountNumber,
              accountName: values.accountName,
              amount: Number(values.amount),
              currency: values.currency,
              remark: values.remark || "",
              pin: pin,
              wallet_id: values.wallet_id
          };
          if (isIntlCurrency(values.currency) && quote) {
              payload.debitAmount = quote.total_debit;
              payload.debitCurrency = "NGN";
          }
          if (isIntlCurrency(values.currency)) {
              payload.recipientAddress = values.recipientAddress?.trim() || undefined;
              payload.recipientCity = values.recipientCity?.trim() || undefined;
              payload.recipientState = values.recipientState?.trim() || undefined;
              payload.recipientPostalCode = values.recipientPostalCode?.trim() || undefined;
              payload.recipientCountry = values.recipientCountry?.trim()?.toUpperCase() || undefined;
              payload.bankName = values.bankName?.trim() || undefined;
              payload.swiftCode = values.swiftCode?.trim()?.toUpperCase() || undefined;
              payload.routingNumber = values.routingNumber?.trim() || undefined;
              payload.accountType = values.accountType?.trim()?.toLowerCase() || undefined;
          }
          if (otpEnabled) {
              payload.otp = otp;
          }

          const response = await api.post("/transfers/single", payload);
          
          // Show success modal
          const selectedBank = banks.find(b => b.code === values.bankCode);
          setSuccessfulTransfer({
              amount: values.amount,
              bankName: selectedBank?.name || "Unknown Bank",
              accountNumber: values.accountNumber,
              accountName: values.accountName,
              remark: values.remark,
              reference: response.data?.data?.reference || `TXN-${Date.now()}`
          });
          setTransferOpen(false);
          setTransferStep("details");
          transferForm.reset();
          setOtp("");
          setPin("");
          setShowTransferSuccessModal(true);
          fetchWalletInfo();
          setTransactionsRefreshKey((k) => k + 1);
      } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Transfer failed",
        variant: "destructive"
      });
    } finally {
          setTransferLoading(false);
      }
  };

  const onFinalizeTransferWithoutOTP = async () => {
    if (!pin || pin.length !== 4) {
      toast({
          title: "Error",
          description: "Please enter your 4-digit transaction PIN",
          variant: "destructive"
      });
      return;
    }
    const values = transferForm.getValues();
    if (isIntlCurrency(values.currency) && isQuoteExpiredNow()) {
      toast({
          title: "Quote expired",
          description: "Your exchange-rate quote has expired. Refresh the quote and confirm the new rate before sending.",
          variant: "destructive"
      });
      return;
    }
    if (isIntlCurrency(values.currency) && (!quote || !quoteConfirmed)) {
      toast({
          title: "Quote confirmation required",
          description: "Please review and confirm the exchange rate quote before sending.",
          variant: "destructive"
      });
      return;
    }
    
    try {
      setTransferLoading(true);
      
      const payload: any = {
          bankCode: values.bankCode,
          accountNumber: values.accountNumber,
          accountName: values.accountName,
          amount: Number(values.amount),
          currency: values.currency,
          remark: values.remark || "",
          pin: pin,
          wallet_id: values.wallet_id
      };
      if (isIntlCurrency(values.currency) && quote) {
          payload.debitAmount = quote.total_debit;
          payload.debitCurrency = "NGN";
      }
      if (values.recipientAddress !== undefined) {
          payload.recipientAddress = values.recipientAddress?.trim() || undefined;
          payload.recipientCity = values.recipientCity?.trim() || undefined;
          payload.recipientState = values.recipientState?.trim() || undefined;
          payload.recipientPostalCode = values.recipientPostalCode?.trim() || undefined;
          payload.recipientCountry = values.recipientCountry?.trim()?.toUpperCase() || undefined;
          payload.bankName = values.bankName?.trim() || undefined;
          payload.swiftCode = values.swiftCode?.trim()?.toUpperCase() || undefined;
          payload.routingNumber = values.routingNumber?.trim() || undefined;
          payload.accountType = values.accountType?.trim()?.toLowerCase() || undefined;
      }

      const response = await api.post("/transfers/single", payload);
      
      // Show success modal
      const selectedBank = banks.find(b => b.code === values.bankCode);
      setSuccessfulTransfer({
          amount: values.amount,
          bankName: selectedBank?.name || "Unknown Bank",
          accountNumber: values.accountNumber,
          accountName: values.accountName,
          remark: values.remark,
          reference: response.data?.data?.reference || `TXN-${Date.now()}`
      });
      setTransferOpen(false);
      setTransferStep("details");
      transferForm.reset();
      setPin("");
      setShowTransferSuccessModal(true);
      fetchWalletInfo();
      setTransactionsRefreshKey((k) => k + 1);
    } catch (error: any) {
    toast({
      title: "Error",
      description: error.response?.data?.error || error.response?.data?.message || "Transfer failed",
      variant: "destructive"
    });
  } finally {
      setTransferLoading(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      setOtpLoading(true);
      const values = transferForm.getValues();
      const requestData: any = { wallet_id: values.wallet_id };
      if (otpMethod) {
        requestData.otp_method = otpMethod;
      }
      await api.post("/transfers/otp/request", requestData);
      toast({ title: "OTP Sent", description: "New OTP sent." });
      startCountdown();
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to resend OTP", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleCreatePin = async () => {
    if (newPin.length !== 4) {
      toast({ title: "Error", description: "PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    try {
      await api.post("/settings/pin", { pin: newPin });
      setPinCreated(true);
      setShowCreatePinModal(false);
      setNewPin("");
      toast({ title: "Success", description: "PIN created successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to create PIN", variant: "destructive" });
    }
  };

  const handleSendResetPinOtp = async () => {
    try {
      await api.post("/settings/pin/send-otp");
      toast({ title: "OTP Sent", description: "OTP sent to reset PIN" });
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to send OTP", variant: "destructive" });
    }
  };

  const handleResetPin = async () => {
    if (newPin.length !== 4) {
      toast({ title: "Error", description: "PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    try {
      await api.put("/settings/pin", { newPin, otp: resetPinOtp });
      setPinCreated(true);
      setShowResetPinModal(false);
      setNewPin("");
      setResetPinOtp("");
      toast({ title: "Success", description: "PIN reset successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.response?.data?.error || error.response?.data?.message || "Failed to reset PIN", variant: "destructive" });
    }
  };

  const fetchWalletInfo = async () => {
    try {
      const [walletRes, otpRes] = await Promise.all([
        api.get<WalletInfo>("/wallet"),
        api.get<OtpEnabledResponse>("/settings/otp-enabled"),
      ]);
      setWalletInfo(walletRes.data);
      if (otpRes.data.success) {
        setOtpEnabled(otpRes.data.otpEnabled);
        setPinCreated(otpRes.data.pinCreated);
      }
    } catch (error: any) {
      console.error("Failed to fetch wallet info", error);
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to load wallet information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletInfo();
  }, []);

  // Re-fetch the OTP-for-transactions setting without reloading the whole
  // wallet payload. Used whenever the transfer dialog opens so the confirm
  // OTP flow always matches the current configuration.
  const refreshOtpSetting = async () => {
    try {
      const otpRes = await api.get<OtpEnabledResponse>("/settings/otp-enabled");
      if (otpRes.data.success) {
        setOtpEnabled(otpRes.data.otpEnabled);
        setPinCreated(otpRes.data.pinCreated);
      }
    } catch {
      // Keep the previously cached value on failure — the backend still
      // enforces the authoritative setting at submit time.
    }
  };

  // Deep link from TransferHistory's "Make New Transfer" chooser — open the
  // transfer dialog immediately and clean the URL so refresh doesn't replay it.
  useEffect(() => {
    if (searchParams.get("transfer") === "new") {
      refreshOtpSetting();
      setTransferOpen(true);
      searchParams.delete("transfer");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link from Dashboard's "Choose wallet to fund" picker — open the fund
  // dialog preselected to the given wallet id, and clean the URL so refresh
  // doesn't replay it. Runs after the wallet payload lands so the id can be
  // matched to Personal/Business.
  const [fundParamHandled, setFundParamHandled] = useState(false);
  useEffect(() => {
    if (loading || fundParamHandled) return;
    const fundId = searchParams.get("fund");
    if (!fundId) return;
    setFundParamHandled(true);
    const isUser = walletInfo?.user_wallet?.id === fundId;
    const isBusiness = walletInfo?.business_wallet?.id === fundId;
    if (isUser) setSelectedWalletType("user");
    else if (isBusiness) setSelectedWalletType("business");
    searchParams.delete("fund");
    setSearchParams(searchParams, { replace: true });
    if (isUser || isBusiness) {
      setFundWalletOpen(true);
    } else {
      toast({
        title: "Wallet not found",
        description: "That wallet is no longer available to fund.",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, walletInfo, searchParams]);

  // Prompt PIN setup before the first transfer instead of failing at submit.
  const openTransferDialog = (walletType: "user" | "business") => {
    setSelectedWalletType(walletType);
    if (walletType === "user" && walletInfo?.user_wallet?.id) {
      transferForm.setValue("wallet_id", walletInfo.user_wallet.id);
    }
    if (walletType === "business" && walletInfo?.business_wallet?.id) {
      transferForm.setValue("wallet_id", walletInfo.business_wallet.id);
    }
    // Always re-check the live OTP configuration when the dialog opens so
    // the "Request OTP" step reflects the CURRENT server-side setting —
    // the flag cached at page load goes stale if the user toggled the
    // setting (here or on another device) after mount.
    refreshOtpSetting();
    if (!loading && !pinCreated) {
      toast({
        title: "Set up your Transaction PIN",
        description: "Create a 4-digit PIN to secure your transfers.",
      });
      setShowCreatePinModal(true);
      return;
    }
    setTransferOpen(true);
  };

  const onFundWallet = async (values: z.infer<typeof fundWalletSchema>) => {
    try {
      setFundingLoading(true);
      const wallet = selectedWalletType === "user" ? walletInfo?.user_wallet : walletInfo?.business_wallet;
      
      if (!wallet?.id) {
        toast({
          title: "Error",
          description: "Wallet not found",
          variant: "destructive",
        });
        return;
      }

      const response = await api.post("/wallet/fund/card", {
        amount: Number(values.amount),
        wallet_id: wallet.id,
        redirect_url: window.location.origin + "/payment/callback",
      });
      
      if (response.data.payment_url) {
        window.location.href = response.data.payment_url;
      } else {
         toast({
          title: "Error",
          description: "No payment URL received",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to initiate payment",
        variant: "destructive",
      });
    } finally {
      setFundingLoading(false);
    }
  };

  const onCreateVirtualAccount = async (type: "Personal" | "Business") => {
    try {
      setCreatingVaLoading(type);
      await api.post("/wallet/create-virtual-account", { accountType: type } as CreateVirtualAccountInput);
      toast({
        title: "Success",
        description: "Virtual Account created successfully",
      });
      fetchWalletInfo();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to create virtual account",
        variant: "destructive",
      });
    } finally {
      setCreatingVaLoading(null);
    }
  };

  // Helper to get bank name: prefer the backend-resolved bank_name, fall back to code map
  const getBankName = (bankCode: string, bankName?: string | null) => {
    if (bankName) return bankName;
    const bankMap: Record<string, string> = {
      "035": "Wema Bank",
      "232": "Sterling Bank",
      "058": "Guaranty Trust Bank",
    };
    return bankMap[bankCode] || `Bank (${bankCode})`;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-8 space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Wallet</h2>
          <p className="text-muted-foreground">Manage your personal and business finances.</p>
        </div>

        {paymentNotice && (
          <Alert
            className={cn(
              "items-start",
              paymentNotice.kind === "cancelled" && "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200",
              paymentNotice.kind === "pending" && "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-500/40 dark:bg-yellow-950/30 dark:text-yellow-200",
              paymentNotice.kind === "success" && "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-200"
            )}
          >
            {paymentNotice.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertTitle>{paymentNotice.title}</AlertTitle>
            <AlertDescription>{paymentNotice.message}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
          {/* Personal Wallet Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <WalletIcon className="h-4 w-4 text-muted-foreground" />
                Personal Wallet
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCreateVirtualAccount("Personal")}
                disabled={creatingVaLoading === "Personal"}
              >
                {creatingVaLoading === "Personal" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Create VA
              </Button>
            </CardHeader>
            <CardContent>
              {walletInfo?.user_wallet ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-2xl font-bold">
                      {walletInfo.user_wallet.currency} {Number(walletInfo.user_wallet.balance).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Available Balance</p>
                  </div>
                  
                  {/* Virtual Accounts */}
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Virtual Accounts</p>
                    </div>
                    
                    {walletInfo.user_wallet.virtual_accounts.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        No virtual accounts yet. Click "Create VA" to create one.
                      </div>
                    ) : (
                      walletInfo.user_wallet.virtual_accounts.map((va) => (
                        <div
                          key={va.id}
                          className={cn(
                            "p-3 rounded-lg border transition-all",
                            va.is_active
                              ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                              : "border-red-500 bg-red-50 dark:bg-red-950/20"
                          )}
                        >
                          {va.is_active && (
                            <div className="flex items-center gap-1 mb-2 text-green-700 dark:text-green-400 text-xs font-semibold">
                              <CheckCircle2 className="h-3 w-3" />
                              Active - Use This Account
                            </div>
                          )}
                          {!va.is_active && (
                            <div className="flex items-center gap-1 mb-2 text-red-700 dark:text-red-400 text-xs font-semibold">
                              <AlertCircle className="h-3 w-3" />
                              Inactive - Do Not Use
                            </div>
                          )}
                          
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-lg font-mono">{va.virtual_account_number}</span>
                              <span className="text-xs text-muted-foreground">{getBankName(va.bank_code, va.bank_name)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{va.account_name}</p>

                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-2 pt-3">
                    <Button 
                      className="w-full" 
                      onClick={() => {
                        setSelectedWalletType("user");
                        setFundWalletOpen(true);
                      }}
                    >
                      <CreditCard className="mr-2 h-4 w-4" /> Fund via Card
                    </Button>
                    <Button 
                      variant="outline"
                      className="w-full" 
                      onClick={() => openTransferDialog("user")}
                    >
                      <ArrowRightLeft className="mr-2 h-4 w-4" /> Transfer
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                   <p className="text-muted-foreground">No personal wallet found.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Business Wallet Card — invited members (non owner/admin) never
              see it at all; the backend already strips business_wallet. */}
          {canManageBusinessWallet && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Business Wallet
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCreateVirtualAccount("Business")}
                disabled={creatingVaLoading === "Business"}
              >
                {creatingVaLoading === "Business" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Create VA
              </Button>
            </CardHeader>
            <CardContent>
              {walletInfo?.business_wallet ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-2xl font-bold">
                      {walletInfo.business_wallet.currency} {Number(walletInfo.business_wallet.balance).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Available Balance</p>
                  </div>
                  
                  {/* Virtual Accounts */}
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Virtual Accounts</p>
                    </div>
                    
                    {walletInfo.business_wallet.virtual_accounts.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        No virtual accounts yet. Click "Create VA" to create one.
                      </div>
                    ) : (
                      walletInfo.business_wallet.virtual_accounts.map((va) => (
                        <div
                          key={va.id}
                          className={cn(
                            "p-3 rounded-lg border transition-all",
                            va.is_active
                              ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                              : "border-red-500 bg-red-50 dark:bg-red-950/20"
                          )}
                        >
                          {va.is_active && (
                            <div className="flex items-center gap-1 mb-2 text-green-700 dark:text-green-400 text-xs font-semibold">
                              <CheckCircle2 className="h-3 w-3" />
                              Active - Use This Account
                            </div>
                          )}
                          {!va.is_active && (
                            <div className="flex items-center gap-1 mb-2 text-red-700 dark:text-red-400 text-xs font-semibold">
                              <AlertCircle className="h-3 w-3" />
                              Inactive - Do Not Use
                            </div>
                          )}
                          
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-lg font-mono">{va.virtual_account_number}</span>
                              <span className="text-xs text-muted-foreground">{getBankName(va.bank_code, va.bank_name)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{va.account_name}</p>

                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-2 pt-3">
                    <Button 
                      className="w-full" 
                      onClick={() => {
                        setSelectedWalletType("business");
                        setFundWalletOpen(true);
                      }}
                    >
                      <CreditCard className="mr-2 h-4 w-4" /> Fund via Card
                    </Button>
                    <Button 
                      variant="outline"
                      className="w-full" 
                      onClick={() => openTransferDialog("business")}
                    >
                      <ArrowRightLeft className="mr-2 h-4 w-4" /> Transfer
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                   <p className="text-muted-foreground">Business wallet will be created automatically after KYC approval.</p>
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </div>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <WalletTransactions refreshKey={transactionsRefreshKey} />
          </TabsContent>
        </Tabs>

        <Dialog open={fundWalletOpen} onOpenChange={setFundWalletOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fund {selectedWalletType === 'user' ? 'Personal' : 'Business'} Wallet</DialogTitle>
              <DialogDescription>
                Enter amount to fund via card.
              </DialogDescription>
            </DialogHeader>
            <Form {...fundForm}>
              <form onSubmit={fundForm.handleSubmit(onFundWallet)} className="space-y-4">
                {/* Wallet switcher — users who arrived from the Dashboard picker
                    (or a card's "Fund via Card" button) can change their mind
                    without closing the dialog. */}
                <div className="space-y-2">
                  <Label>Wallet</Label>
                  <Select
                    value={selectedWalletType}
                    onValueChange={(v) => setSelectedWalletType(v as "user" | "business")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {walletInfo?.user_wallet && (
                        <SelectItem value="user">
                          Personal ({walletInfo.user_wallet.currency} {Number(walletInfo.user_wallet.balance).toLocaleString()})
                        </SelectItem>
                      )}
                      {walletInfo?.business_wallet && canManageBusinessWallet && (
                        <SelectItem value="business">
                          Business ({walletInfo.business_wallet.currency} {Number(walletInfo.business_wallet.balance).toLocaleString()})
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <FormField
                  control={fundForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (NGN)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="100" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" loading={fundingLoading}>
                    Proceed to Payment
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={transferOpen} onOpenChange={(open) => {
            setTransferOpen(open);
            if (!open) {
              setTransferStep("details");
              transferForm.reset();
              setOtp("");
              setPin("");
              setOtpMethod("");
              setLookupName(null);
              setQuote(null);
              setQuoteError(null);
              setQuoteConfirmed(false);
              setQuoteExpiresAt(null);
            }
        }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Transfer Funds</DialogTitle>
              <DialogDescription>
                Transfer funds from your {selectedWalletType === 'user' ? 'Personal' : 'Business'} Wallet.
              </DialogDescription>
            </DialogHeader>
            
            {transferStep === 'details' ? (
                <Form {...transferForm}>
                  <form onSubmit={transferForm.handleSubmit(onInitiateTransfer)} className="space-y-4">

                    <FormField
                      control={transferForm.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <Select value={field.value} onValueChange={(v) => {
                            field.onChange(v);
                            setLookupName(null);
                            setLookupError(null);
                            setQuote(null);
                            setQuoteError(null);
                            setQuoteConfirmed(false);
                            setQuoteExpiresAt(null);
                            transferForm.setValue("bankCode", "");
                            transferForm.setValue("accountName", "");
                          }}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select currency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="NGN">NGN — Nigeria (local bank)</SelectItem>
                              <SelectItem value="USD">USD — International payout</SelectItem>
                              <SelectItem value="GBP">GBP — United Kingdom</SelectItem>
                              <SelectItem value="EUR">EUR — Europe (SEPA)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Recent beneficiaries for the selected currency — one-tap fill. */}
                    {beneficiaries.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Recent beneficiaries</p>
                        <div className="flex flex-wrap gap-1.5">
                          {beneficiaries.slice(0, 8).map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => applyBeneficiary(b)}
                              className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                              title={`${b.accountName} · ${b.accountNumber}${b.bankName ? ` · ${b.bankName}` : ""}`}
                            >
                              <span className="font-medium truncate max-w-[180px]">{b.accountName || b.accountNumber}</span>
                              <span className="text-muted-foreground truncate max-w-[110px]">{b.accountNumber}</span>
                            </button>
                          ))}
                        </div>
                        <a href="/beneficiaries" className="text-xs text-primary hover:underline">Manage all beneficiaries →</a>
                      </div>
                    )}

                    {watchedCurrency === "NGN" ? (
                    <FormField
                      control={transferForm.control}
                      name="bankCode"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Bank Name</FormLabel>
                          <Popover open={bankOpen} onOpenChange={setBankOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={bankOpen}
                                  className="w-full justify-between"
                                >
                                  {field.value
                                    ? banks.find(
                                        (bank) => bank.code === field.value
                                      )?.name
                                    : "Select bank"}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[350px] p-0">
                              <Command>
                                <CommandInput placeholder="Search bank..." />
                                <CommandList>
                                  <CommandEmpty>No bank found.</CommandEmpty>
                                  <CommandGroup>
                                    {banks.map((bank) => (
                                      <CommandItem
                                         value={bank.name}
                                         key={bank.code}
                                         onSelect={() => {
                                           field.onChange(bank.code);
                                           setBankOpen(false);
                                         }}
                                       >
                                        {bank.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    ) : (
                      <>
                      {/* Rail only applies to USD — GBP uses sort codes, EUR uses
                          SWIFT/IBAN. The value is auto-set for GBP/EUR. */}
                      {watchedCurrency === "USD" && (
                      <FormField
                        control={transferForm.control}
                        name="bankCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payout rail</FormLabel>
                            <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose payout rail" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="ACH">ACH — U.S. bank account (local rails)</SelectItem>
                                <SelectItem value="SWIFT">SWIFT — International wire transfer</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      )}
                      <FormField
                        control={transferForm.control}
                        name="bankName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bank name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. JPMorgan Chase Bank" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {watchedCurrency === "GBP" && (
                        <FormField
                          control={transferForm.control}
                          name="routingNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sort code</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. 308463" maxLength={8} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      {watchedCurrency === "EUR" && (
                        <FormField
                          control={transferForm.control}
                          name="swiftCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>SWIFT / BIC code</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. BECFDE7HKKX" maxLength={11} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      {watchedCurrency === "USD" && watchedBankCode === "SWIFT" && (
                        <FormField
                          control={transferForm.control}
                          name="swiftCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>SWIFT / BIC code</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. CHASUS33" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      {watchedCurrency === "USD" && (
                        <FormField
                          control={transferForm.control}
                          name="routingNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Routing number (ABA)</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. 021000021" maxLength={12} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      {watchedCurrency === "GBP" && (
                        <FormField
                          control={transferForm.control}
                          name="accountType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Account type</FormLabel>
                              <Select value={field.value || "personal"} onValueChange={(v) => field.onChange(v)}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select account type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="personal">Personal</SelectItem>
                                  <SelectItem value="corporate">Corporate</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      {watchedCurrency === "USD" && (
                        <FormField
                          control={transferForm.control}
                          name="accountType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Account type</FormLabel>
                              <Select value={field.value || "checking"} onValueChange={(v) => field.onChange(v)}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select account type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="checking">Checking</SelectItem>
                                  <SelectItem value="depository">Depository</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      </>
                    )}

                    <FormField
                      control={transferForm.control}
                      name="accountNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isIntlCurrency(watchedCurrency) ? "Account Number / IBAN" : "Account Number"}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={isIntlCurrency(watchedCurrency) ? "International account number or IBAN" : "0123456789"}
                              {...field}
                              maxLength={isIntlCurrency(watchedCurrency) ? undefined : 10}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {watchedCurrency === "NGN" && lookupLoading && (
                      <p className="text-sm text-muted-foreground">Verifying account...</p>
                    )}

                    {watchedCurrency === "NGN" && lookupName && !lookupLoading && (
                      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Account name: {lookupName}
                      </p>
                    )}

                    <FormField
                      control={transferForm.control}
                      name="accountName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isIntlCurrency(watchedCurrency) ? "Beneficiary Name" : "Account Name"}</FormLabel>
                          <FormControl>
                            <Input
                                placeholder={isIntlCurrency(watchedCurrency) ? "Enter beneficiary name" : "Verified account name will appear here"}
                                {...field}
                                readOnly={watchedCurrency === "NGN"}
                                className={watchedCurrency === "NGN" ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {isIntlCurrency(watchedCurrency) && (
                      <div className="rounded-xl border p-3 space-y-3 bg-muted/20">
                        <p className="text-sm font-medium">
                          Recipient address <span className="text-destructive">*</span>
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            required for secure international payouts
                          </span>
                        </p>

                        <FormField
                          control={transferForm.control}
                          name="recipientCountry"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Country</FormLabel>
                              <Select
                                value={field.value}
                                onValueChange={(v) => field.onChange(v)}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select recipient country" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-64">
                                  {INTL_PAYOUT_COUNTRIES.map((c) => (
                                    <SelectItem key={c.code} value={c.code}>
                                      {c.name} ({c.code})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormItem>
                          <FormLabel>Street address</FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                placeholder="Start typing the street address…"
                                value={transferForm.watch("recipientAddress") || ""}
                                onChange={(e) => {
                                  transferForm.setValue("recipientAddress", e.target.value, { shouldValidate: false });
                                }}
                                autoComplete="off"
                              />
                            </FormControl>
                            {addressSearching && (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground absolute right-3 top-2.5" />
                            )}
                            {addressSuggestOpen && addressSuggestions.length > 0 && (
                              <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-y-auto">
                                {addressSuggestions.map((item, idx) => (
                                  <button
                                    key={item.place_id || idx}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground border-b last:border-b-0"
                                    onClick={() => pickAddressSuggestion(item)}
                                  >
                                    {item.display_name}
                                  </button>
                                ))}
                                <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
                                  Address data © OpenStreetMap contributors
                                </p>
                              </div>
                            )}
                          </div>
                          <FormMessage>{transferForm.formState.errors.recipientAddress?.message}</FormMessage>
                        </FormItem>

                        <div className="grid grid-cols-2 gap-3">
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="City"
                                value={transferForm.watch("recipientCity") || ""}
                                onChange={(e) => transferForm.setValue("recipientCity", e.target.value, { shouldValidate: false })}
                              />
                            </FormControl>
                            <FormMessage>{transferForm.formState.errors.recipientCity?.message}</FormMessage>
                          </FormItem>
                          <FormItem>
                            <FormLabel>State / Province</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="State"
                                value={transferForm.watch("recipientState") || ""}
                                onChange={(e) => transferForm.setValue("recipientState", e.target.value, { shouldValidate: false })}
                              />
                            </FormControl>
                          </FormItem>
                          <FormItem className="col-span-2 sm:col-span-1">
                            <FormLabel>Postal code</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="ZIP / postcode"
                                value={transferForm.watch("recipientPostalCode") || ""}
                                onChange={(e) => transferForm.setValue("recipientPostalCode", e.target.value, { shouldValidate: false })}
                              />
                            </FormControl>
                            <FormMessage>{transferForm.formState.errors.recipientPostalCode?.message}</FormMessage>
                          </FormItem>
                        </div>
                      </div>
                    )}

                    {lookupError && watchedCurrency === "NGN" && (
                        <p className="text-sm text-destructive mt-1">
                            {lookupError}
                        </p>
                    )}

                    <FormField
                      control={transferForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount ({isIntlCurrency(watchedCurrency) ? `${watchedCurrency} — amount recipient receives` : "NGN"})</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="100" {...field} />
                          </FormControl>
                          {isIntlCurrency(watchedCurrency) && payoutLimits[watchedCurrency] && (
                            <p className="text-xs text-muted-foreground">
                              Minimum {watchedCurrency} {payoutLimits[watchedCurrency].min.toLocaleString()} · Maximum {watchedCurrency} {payoutLimits[watchedCurrency].max.toLocaleString()} per transfer
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* International payout quote (USD/GBP/EUR): Conversion rate,
                        Fee and Total only — the platform margin is baked into
                        the conversion rate and never shown. */}
                    {isIntlCurrency(watchedCurrency) && (
                      <div className={cn("rounded-xl border bg-muted/30 p-3 space-y-2", quoteExpired && "opacity-80")}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Payout quote</p>
                          <div className="flex items-center gap-2">
                            {quoteLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                            {quote && !quoteExpired && quoteCountdown && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                <Timer className="h-3 w-3" />
                                Rate locks in {quoteCountdown}
                              </span>
                            )}
                            {quoteExpired && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                                <ClockAlert className="h-3 w-3" />
                                Quote expired
                              </span>
                            )}
                          </div>
                        </div>
                        {quoteError && (
                          <p className="text-xs text-destructive">{quoteError}</p>
                        )}
                        {quote && (
                          <>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                              <span className="text-muted-foreground">Conversion rate</span>
                              <span className="text-right font-medium">
                                1 {quote.destination_currency} = ₦{Number(quote.conversion_rate ?? quote.marked_up_rate ?? quote.live_rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-muted-foreground">Fee</span>
                              <span className="text-right font-medium">
                                ₦{Number(quote.fee).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </span>
                              <span className="font-medium">Total amount</span>
                              <span className="text-right font-bold text-primary">
                                ₦{Number(quote.total_debit).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            {quoteExpired ? (
                              <div className="flex items-center justify-between gap-2 rounded-lg bg-background p-2">
                                <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                                  <ClockAlert className="h-3.5 w-3.5 shrink-0" />
                                  This quote has expired — refresh for the current rate.
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={handleRefreshQuote}
                                  disabled={quoteLoading}
                                  className="shrink-0"
                                >
                                  {quoteLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                                  Refresh quote
                                </Button>
                              </div>
                            ) : (
                              <label className="flex items-start gap-2 rounded-lg bg-background p-2 text-xs cursor-pointer">
                                <Checkbox
                                  checked={quoteConfirmed}
                                  onCheckedChange={(v) => setQuoteConfirmed(v === true)}
                                  disabled={quoteExpired}
                                  aria-label="Confirm exchange rate quote"
                                />
                                <span>
                                  I confirm the exchange rate and total debit above. Rates refresh if you change the amount.
                                </span>
                              </label>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <FormField
                      control={transferForm.control}
                      name="remark"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Remark (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Transfer description" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <Label>Transaction PIN</Label>
                      <PinInput value={pin} onChange={setPin} />
                      {!pinCreated && (
                        <Button variant="link" size="sm" onClick={() => setShowCreatePinModal(true)} className="p-0 h-auto">
                          Create PIN
                        </Button>
                      )}
                      {pinCreated && (
                        <Button variant="link" size="sm" onClick={() => setShowResetPinModal(true)} className="p-0 h-auto">
                          Forgot PIN?
                        </Button>
                      )}
                    </div>

                    {otpEnabled && (
                      <div className="space-y-2">
                        <Label>OTP Method (Optional)</Label>
                        <RadioGroup value={otpMethod} onValueChange={setOtpMethod} className="flex flex-col gap-2">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="" id="method-default" />
                            <Label htmlFor="method-default">Default</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="email" id="method-email" />
                            <Label htmlFor="method-email">Email</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="sms" id="method-sms" />
                            <Label htmlFor="method-sms">SMS</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="whatsapp" id="method-whatsapp" />
                            <Label htmlFor="method-whatsapp">WhatsApp</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    )}

                    <DialogFooter>
                      <Button
                        type="submit"
                        loading={otpLoading || transferLoading}
                        disabled={!!lookupError || (watchedCurrency === "NGN" && !lookupName) || (isIntlCurrency(watchedCurrency) && (!quote || !quoteConfirmed || quoteExpired))}
                      >
                        {otpEnabled ? "Request OTP" : "Confirm Transfer"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
            ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Enter OTP</Label>
                    <Input 
                      placeholder="123456" 
                      value={otp} 
                      onChange={(e) => setOtp(e.target.value)} 
                      maxLength={6}
                    />
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleResendOTP} 
                    disabled={isActive || otpLoading}
                    className="w-full"
                  >
                    {isActive ? `Resend OTP in ${seconds}s` : "Resend OTP"}
                  </Button>

                  <DialogFooter>
                    <Button 
                      variant="outline" 
                      onClick={() => setTransferStep("details")}
                    >
                      Back
                    </Button>
                    <Button 
                      onClick={onFinalizeTransfer} 
                      loading={transferLoading}
                    >
                      Confirm Transfer
                    </Button>
                  </DialogFooter>
                </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Create PIN Modal */}
        <Dialog open={showCreatePinModal} onOpenChange={setShowCreatePinModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Transaction PIN</DialogTitle>
              <DialogDescription>Create a 4-digit PIN for your transactions.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>New PIN</Label>
                <PinInput value={newPin} onChange={setNewPin} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreatePinModal(false)}>Cancel</Button>
                <Button onClick={handleCreatePin}>Create PIN</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reset PIN Modal */}
        <Dialog open={showResetPinModal} onOpenChange={setShowResetPinModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Transaction PIN</DialogTitle>
              <DialogDescription>Enter OTP to reset your PIN.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>OTP</Label>
                <Input 
                  placeholder="Enter OTP" 
                  value={resetPinOtp} 
                  onChange={(e) => setResetPinOtp(e.target.value)} 
                />
                <Button variant="ghost" size="sm" onClick={handleSendResetPinOtp} className="p-0 h-auto">
                  Send OTP
                </Button>
              </div>
              <div className="space-y-2">
                <Label>New PIN</Label>
                <PinInput value={newPin} onChange={setNewPin} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowResetPinModal(false)}>Cancel</Button>
                <Button onClick={handleResetPin}>Reset PIN</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Transfer Success Modal */}
        <Dialog open={showTransferSuccessModal} onOpenChange={setShowTransferSuccessModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-6 w-6" /> Transfer Successful!
              </DialogTitle>
            </DialogHeader>
            {successfulTransfer && (
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono">{successfulTransfer.reference}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold">NGN {Number(successfulTransfer.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Bank</span>
                  <span>{successfulTransfer.bankName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Account Number</span>
                  <span>{successfulTransfer.accountNumber}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Account Name</span>
                  <span>{successfulTransfer.accountName}</span>
                </div>
                {successfulTransfer.remark && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Remark</span>
                    <span>{successfulTransfer.remark}</span>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => {
                setShowTransferSuccessModal(false);
                setSuccessfulTransfer(null);
              }}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
