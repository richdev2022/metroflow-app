import React, { useCallback, useEffect, useState } from "react";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Globe,
  Home,
} from "lucide-react";
import { TransferBeneficiary } from "@shared/api";

const CURRENCY_TABS = ["NGN", "USD", "GBP", "EUR"] as const;
type CurrencyTab = (typeof CURRENCY_TABS)[number];

const CURRENCY_SYMBOLS: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

// Same corridor list the transfer form uses (ISO-3166-1 alpha-2).
const INTL_PAYOUT_COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IE", name: "Ireland" },
  { code: "NL", name: "Netherlands" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "PT", name: "Portugal" },
  { code: "FI", name: "Finland" },
  { code: "GR", name: "Greece" },
  { code: "LU", name: "Luxembourg" },
];

const emptyForm = {
  currency: "NGN" as CurrencyTab,
  bankCode: "",
  accountNumber: "",
  accountName: "",
  bankName: "",
  routingNumber: "",
  swiftCode: "",
  accountType: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
  email: "",
};

export default function Beneficiaries() {
  const { toast } = useToast();
  const [tab, setTab] = useState<CurrencyTab>("NGN");
  const [items, setItems] = useState<TransferBeneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyState, setVerifyState] = useState<{ kind: "resolved" | "format" | null; name: string | null }>({ kind: null, name: null });
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteTarget, setDeleteTarget] = useState<TransferBeneficiary | null>(null);
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);

  const isIntl = tab !== "NGN";

  const load = useCallback(async (currency: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/transfers/beneficiaries?currency=${currency}&limit=200`);
      setItems(res.data?.success && Array.isArray(res.data?.data) ? res.data.data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  useEffect(() => {
    if (tab !== "NGN") return;
    api
      .get("/transfers/banks")
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data?.data)) setBanks(res.data.data);
      })
      .catch(() => {});
  }, [tab]);

  const resetForm = (currency: CurrencyTab) => {
    setForm({ ...emptyForm, currency, country: currency === "GBP" ? "GB" : currency === "EUR" ? "DE" : "US" });
    setVerifyState({ kind: null, name: null });
  };

  const openAdd = () => {
    resetForm(tab);
    setAddOpen(true);
  };

  const setField = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setVerifyState({ kind: null, name: null });
  };

  // Verify BEFORE saving: NGN resolves the real account name through the
  // provider; international corridors are format-validated server-side
  // (routing checksum / sort code / SWIFT) with a best-effort resolve attempt.
  const verifyBeneficiary = async () => {
    if (!form.accountNumber.trim()) {
      toast({ title: "Account number required", variant: "destructive" });
      return;
    }
    if (!isIntl && !form.bankCode) {
      toast({ title: "Select the beneficiary's bank first", variant: "destructive" });
      return;
    }
    setVerifying(true);
    try {
      const res = await api.post("/transfers/beneficiaries", {
        currency: form.currency,
        bankCode: isIntl ? "SWIFT" : form.bankCode,
        accountNumber: form.accountNumber.trim(),
        accountName: form.accountName.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        routingNumber: form.routingNumber.trim() || undefined,
        swiftCode: form.swiftCode.trim() || undefined,
        accountType: form.accountType || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        postalCode: form.postalCode.trim() || undefined,
        country: form.country || undefined,
        email: form.email.trim() || undefined,
      });
      if (res.data?.success) {
        const data = res.data.data || {};
        setVerifyState({ kind: data.verification === "resolved" ? "resolved" : "format", name: data.resolvedName || data.accountName || form.accountName });
        if (!form.accountName && data.resolvedName) setField("accountName", data.resolvedName);
        toast({
          title: data.verification === "resolved" ? "Account verified" : "Details validated",
          description: data.verification === "resolved"
            ? `Verified account name: ${data.resolvedName}`
            : "The beneficiary's routing details passed validation for this corridor.",
        });
      } else {
        toast({ title: "Verification failed", description: res.data?.error || "Could not verify this account", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Verification failed", description: e.response?.data?.error || "Could not verify this account", variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const saveBeneficiary = async () => {
    setSaving(true);
    try {
      const res = await api.post("/transfers/beneficiaries", {
        currency: form.currency,
        bankCode: isIntl ? "SWIFT" : form.bankCode,
        accountNumber: form.accountNumber.trim(),
        accountName: form.accountName.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        routingNumber: form.routingNumber.trim() || undefined,
        swiftCode: form.swiftCode.trim() || undefined,
        accountType: form.accountType || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        postalCode: form.postalCode.trim() || undefined,
        country: form.country || undefined,
        email: form.email.trim() || undefined,
      });
      if (res.data?.success) {
        toast({ title: "Beneficiary saved" });
        setAddOpen(false);
        load(tab);
      } else {
        toast({ title: "Could not save beneficiary", description: res.data?.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Could not save beneficiary", description: e.response?.data?.error || "Please check the details and try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/transfers/beneficiaries/${deleteTarget.id}`);
      toast({ title: "Beneficiary removed" });
      setDeleteTarget(null);
      load(tab);
    } catch (e: any) {
      toast({ title: "Could not remove beneficiary", description: e.response?.data?.error, variant: "destructive" });
    }
  };

  const localItems = items.filter((b) => !b.isIntl);
  const globalItems = items.filter((b) => b.isIntl);

  const renderCard = (b: TransferBeneficiary) => (
    <Card key={b.id} className="overflow-hidden">
      <CardContent className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{b.accountName || "Unnamed beneficiary"}</p>
            <Badge variant="secondary" className="shrink-0">
              {CURRENCY_SYMBOLS[b.currency] || ""} {b.currency}
            </Badge>
            {b.verification === "resolved" ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-3 w-3" /> Verified
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{b.accountNumber}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {[b.bankName, b.routingNumber ? `Sort/Routing: ${b.routingNumber}` : null, b.swiftCode ? `SWIFT: ${b.swiftCode}` : null, b.recipientCountry ? b.recipientCountry : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {b.address ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {[b.address, b.city, b.state, b.postalCode].filter(Boolean).join(", ")}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive shrink-0"
          onClick={() => setDeleteTarget(b)}
          aria-label="Remove beneficiary"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <Layout>
      <div className="container max-w-4xl py-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Beneficiaries
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Saved transfer recipients — local Nigerian banks and international payouts (USD, GBP, EUR). New beneficiaries you transfer to are added here automatically.
            </p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> Add beneficiary
          </Button>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {CURRENCY_TABS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setTab(c)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading beneficiaries…
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center space-y-2">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="font-medium">No {tab} beneficiaries yet</p>
              <p className="text-sm text-muted-foreground">
                {isIntl
                  ? "Add an international beneficiary once and reuse it for every payout."
                  : "Transfer to a Nigerian bank account, or add one manually."}
              </p>
              <Button variant="outline" size="sm" onClick={openAdd} className="mt-2">
                <Plus className="mr-1 h-4 w-4" /> Add {tab} beneficiary
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {!isIntl && globalItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Globe className="h-4 w-4" /> International
                </p>
                <div className="grid gap-3">{globalItems.map(renderCard)}</div>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                <Home className="h-4 w-4" /> {isIntl ? `${tab} payouts` : "Local (NGN)"}
              </p>
              <div className="grid gap-3">
                {(isIntl ? items : localItems.length > 0 ? localItems : items).map(renderCard)}
              </div>
            </div>
          </div>
        )}

        {/* Add beneficiary dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add beneficiary</DialogTitle>
              <DialogDescription>
                Accounts are verified before saving — NGN accounts resolve the real account name; international details are validated per corridor.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => resetForm(v as CurrencyTab)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_TABS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!isIntl && (
                <div className="space-y-1.5">
                  <Label>Bank</Label>
                  <Select value={form.bankCode} onValueChange={(v) => setField("bankCode", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {banks.map((bank) => (
                        <SelectItem key={bank.code} value={bank.code}>
                          {bank.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isIntl && (
                <>
                  <div className="space-y-1.5">
                    <Label>Bank name</Label>
                    <Input value={form.bankName} onChange={(e) => setField("bankName", e.target.value)} placeholder="e.g. Bank of America" />
                  </div>
                  {form.currency === "USD" && (
                    <div className="space-y-1.5">
                      <Label>Routing number (ABA)</Label>
                      <Input value={form.routingNumber} onChange={(e) => setField("routingNumber", e.target.value)} placeholder="9 digits, e.g. 021000021" maxLength={12} />
                    </div>
                  )}
                  {form.currency === "GBP" && (
                    <div className="space-y-1.5">
                      <Label>Sort code</Label>
                      <Input value={form.routingNumber} onChange={(e) => setField("routingNumber", e.target.value)} placeholder="6 digits, e.g. 308463" maxLength={8} />
                    </div>
                  )}
                  {form.currency === "EUR" && (
                    <div className="space-y-1.5">
                      <Label>SWIFT / BIC</Label>
                      <Input value={form.swiftCode} onChange={(e) => setField("swiftCode", e.target.value)} placeholder="8 or 11 characters, e.g. BECFDE7HKKX" maxLength={11} />
                    </div>
                  )}
                  {form.currency === "USD" && (
                    <div className="space-y-1.5">
                      <Label>Account type</Label>
                      <Select value={form.accountType || "checking"} onValueChange={(v) => setField("accountType", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="checking">Checking</SelectItem>
                          <SelectItem value="savings">Savings</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {form.currency === "GBP" && (
                    <div className="space-y-1.5">
                      <Label>Account type</Label>
                      <Select value={form.accountType || "personal"} onValueChange={(v) => setField("accountType", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personal">Personal</SelectItem>
                          <SelectItem value="corporate">Corporate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Country</Label>
                    <Select value={form.country} onValueChange={(v) => setField("country", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {INTL_PAYOUT_COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name} ({c.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Street address</Label>
                    <Input value={form.address} onChange={(e) => setField("address", e.target.value)} placeholder="e.g. 1801 Main St" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>City</Label>
                      <Input value={form.city} onChange={(e) => setField("city", e.target.value)} placeholder="City" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>State / Province</Label>
                      <Input value={form.state} onChange={(e) => setField("state", e.target.value)} placeholder="State" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Postal code</Label>
                      <Input value={form.postalCode} onChange={(e) => setField("postalCode", e.target.value)} placeholder="ZIP / postcode" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email (optional)</Label>
                      <Input value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="beneficiary@email.com" />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>{isIntl ? "Account number / IBAN" : "Account number"}</Label>
                <Input
                  value={form.accountNumber}
                  onChange={(e) => setField("accountNumber", e.target.value)}
                  placeholder={isIntl ? "International account number or IBAN" : "10-digit NUBAN"}
                  maxLength={isIntl ? 40 : 10}
                  inputMode={isIntl ? "text" : "numeric"}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{isIntl ? "Beneficiary name" : "Account name"}</Label>
                <Input value={form.accountName} onChange={(e) => setField("accountName", e.target.value)} placeholder={isIntl ? "Full beneficiary name" : "Auto-filled after verification"} readOnly={!isIntl && verifyState.kind === "resolved"} />
              </div>

              {verifyState.kind && (
                <p className={`text-sm flex items-center gap-1.5 ${verifyState.kind === "resolved" ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`}>
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {verifyState.kind === "resolved"
                    ? `Verified account name: ${verifyState.name}`
                    : "Details passed corridor validation"}
                </p>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={verifyBeneficiary} disabled={verifying || saving}>
                {verifying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
                Verify account
              </Button>
              <Button onClick={saveBeneficiary} disabled={saving || verifying}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                Save beneficiary
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove beneficiary?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.accountName} ({deleteTarget?.accountNumber}) will be removed from your saved beneficiaries. Transfers already sent are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
