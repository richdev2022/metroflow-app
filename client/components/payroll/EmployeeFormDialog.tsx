import React, { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, CheckCircle2, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { lookupAccountName } from "@/lib/account-lookup";
import type { PayrollDirectoryEmployee } from "@shared/api";

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the dialog edits this employee, otherwise it creates a new one */
  employee?: PayrollDirectoryEmployee | null;
  /** Called after a successful save so the parent can refetch the directory */
  onSaved?: () => void;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  department: string;
  job_title: string;
  salary: string;
  currency: "NGN" | "USD";
  // NGN recipient
  bank_code: string;
  account_number: string;
  account_name: string;
  // USD recipient
  bank_name: string;
  swift_code: string;
  routing_number: string;
  beneficiary_address: string;
  beneficiary_city: string;
  beneficiary_country: string;
  contract_start_date: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  department: "",
  job_title: "",
  salary: "",
  currency: "NGN",
  bank_code: "",
  account_number: "",
  account_name: "",
  bank_name: "",
  swift_code: "",
  routing_number: "",
  beneficiary_address: "",
  beneficiary_city: "",
  beneficiary_country: "",
  contract_start_date: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add / Edit payroll employee modal with the FULL parameter set.
 *
 * The currency selects which recipient fields are shown:
 *  - NGN -> Nigerian bank picker + 10-digit account number (with live account-name lookup)
 *  - USD -> international fields (bank name, SWIFT, routing number, IBAN/account, address)
 *
 * Saving goes through POST /payroll/employees/import with a single-row
 * `employees` array, which creates new employees and refreshes payroll details
 * for existing ones (matched by email) in one endpoint.
 */
export function EmployeeFormDialog({ open, onOpenChange, employee, onSaved }: EmployeeFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!employee;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [bankOpen, setBankOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupName, setLookupName] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Populate form when editing
  useEffect(() => {
    if (!open) return;
    if (employee) {
      const currency = (employee.salary_currency || "NGN").toUpperCase() === "USD" ? "USD" : "NGN";
      setForm({
        name: employee.name || "",
        email: employee.email || "",
        phone: employee.phone_number || "",
        department: employee.department || "",
        job_title: employee.job_title || "",
        salary: employee.salary_amount !== null && employee.salary_amount !== undefined ? String(employee.salary_amount) : "",
        currency,
        bank_code: employee.bank_code || "",
        account_number: employee.account_number || "",
        account_name: employee.account_name || "",
        bank_name: employee.bank_name || "",
        swift_code: employee.swift_code || "",
        routing_number: employee.routing_number || "",
        beneficiary_address: employee.beneficiary_address || "",
        beneficiary_city: employee.beneficiary_city || "",
        beneficiary_country: employee.beneficiary_country || "",
        contract_start_date: employee.contract_start_date ? String(employee.contract_start_date).split("T")[0] : "",
      });
      setLookupName(employee.verified_account_name || employee.account_name || null);
      setLookupError(null);
    } else {
      setForm({ ...EMPTY_FORM });
      setLookupName(null);
      setLookupError(null);
    }
  }, [open, employee]);

  // Fetch Nigerian banks for the NGN bank picker
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .get("/transfers/banks")
      .then((res) => {
        if (!cancelled && res.data?.success && Array.isArray(res.data.data)) {
          setBanks(res.data.data);
        }
      })
      .catch((e) => console.error("Failed to fetch banks", e));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Live account-name lookup for NGN recipients (debounced)
  useEffect(() => {
    if (!open || form.currency !== "NGN") return;
    const accountNumber = form.account_number.trim();
    const bankCode = form.bank_code;
    if (accountNumber.length === 10 && bankCode) {
      const timer = setTimeout(async () => {
        try {
          setLookupLoading(true);
          setLookupError(null);
          setLookupName(null);
          const name = await lookupAccountName(bankCode, accountNumber);
          setLookupName(name);
          if (name) set("account_name", name);
        } catch (e: any) {
          setLookupName(null);
          setLookupError(e.response?.data?.error || e.response?.data?.message || "Could not verify account name");
        } finally {
          setLookupLoading(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setLookupName(null);
      setLookupError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.account_number, form.bank_code, form.currency, open]);

  // Reset bank fields when the currency changes so stale values are not submitted
  const handleCurrencyChange = (value: "NGN" | "USD") => {
    setForm((f) => ({
      ...f,
      currency: value,
      bank_code: "",
      account_number: "",
      account_name: "",
      bank_name: "",
      swift_code: "",
      routing_number: "",
      beneficiary_address: "",
      beneficiary_city: "",
      beneficiary_country: "",
    }));
    setLookupName(null);
    setLookupError(null);
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return "Employee name is required";
    if (!EMAIL_RE.test(form.email.trim())) return "A valid email address is required";
    if (form.salary && (isNaN(Number(form.salary)) || Number(form.salary) < 0)) return "Salary must be a positive number";
    if (form.currency === "NGN" && form.account_number && !/^\d{10}$/.test(form.account_number.trim()))
      return "NGN account number must be 10 digits";
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      toast({ title: "Check the form", description: validationError, variant: "destructive" });
      return;
    }

    const row: Record<string, any> = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
    };
    if (form.job_title.trim()) row.job_title = form.job_title.trim();
    if (form.department.trim()) row.department = form.department.trim();
    if (form.phone.trim()) row.phone_number = form.phone.trim();
    if (form.salary.trim() !== "" && !isNaN(Number(form.salary))) row.salary = Number(form.salary);
    row.currency = form.currency;
    if (form.contract_start_date) row.contract_start_date = form.contract_start_date;
    if (form.currency === "NGN") {
      if (form.bank_code) row.bank_code = form.bank_code;
      if (form.account_number.trim()) row.account_number = form.account_number.trim();
      if (form.account_name.trim()) row.account_name = form.account_name.trim();
    } else {
      if (form.bank_name.trim()) row.bank_name = form.bank_name.trim();
      if (form.swift_code.trim()) row.swift_code = form.swift_code.trim();
      if (form.routing_number.trim()) row.routing_number = form.routing_number.trim();
      if (form.account_number.trim()) row.account_number = form.account_number.trim();
      if (form.beneficiary_address.trim()) row.beneficiary_address = form.beneficiary_address.trim();
      if (form.beneficiary_city.trim()) row.beneficiary_city = form.beneficiary_city.trim();
      if (form.beneficiary_country.trim()) row.beneficiary_country = form.beneficiary_country.trim().toUpperCase();
    }

    setSaving(true);
    try {
      const res = await api.post("/payroll/employees/import", { employees: [row] });
      const data = res.data?.data;
      if (res.data?.success && data && data.failed === 0) {
        toast({
          title: isEdit ? "Employee updated" : "Employee added",
          description: isEdit
            ? "Payroll details saved. Verification resets if bank details changed."
            : `${form.name} was added${data.results?.[0]?.inviteLink ? " and an invite email was sent" : ""}.`,
        });
        onOpenChange(false);
        onSaved?.();
      } else {
        const rowError = data?.results?.find((r: any) => !r.success)?.error;
        toast({
          title: "Save failed",
          description: rowError || res.data?.error || "Could not save the employee",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e.response?.data?.error || e.response?.data?.message || "Could not save the employee",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedBank = banks.find((b) => b.code === form.bank_code);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Employee" : "Add Employee"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update payroll and recipient details. Changing bank details resets verification."
              : "Add a payroll employee. They will receive an invite email automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Identity */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="emp-name">Full name *</Label>
              <Input id="emp-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ada Obi" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="emp-email">Email *</Label>
              <Input
                id="emp-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="employee@company.com"
                disabled={isEdit}
              />
              {isEdit && <p className="text-xs text-muted-foreground">Email is the unique identifier and cannot be changed.</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="emp-phone">Phone number</Label>
              <Input id="emp-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+234..." />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="emp-dept">Department</Label>
              <Input id="emp-dept" value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Engineering" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="emp-title">Job title</Label>
              <Input id="emp-title" value={form.job_title} onChange={(e) => set("job_title", e.target.value)} placeholder="e.g. Backend Engineer" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="emp-contract">Contract start date</Label>
              <Input id="emp-contract" type="date" value={form.contract_start_date} onChange={(e) => set("contract_start_date", e.target.value)} />
            </div>
          </div>

          {/* Compensation */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="emp-salary">Salary amount</Label>
              <Input
                id="emp-salary"
                type="number"
                inputMode="decimal"
                min="0"
                value={form.salary}
                onChange={(e) => set("salary", e.target.value)}
                placeholder="250000"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Salary currency</Label>
              <Select value={form.currency} onValueChange={(v) => handleCurrencyChange(v as "NGN" | "USD")}>
                <SelectTrigger aria-label="Salary currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NGN">NGN — Nigeria</SelectItem>
                  <SelectItem value="USD">USD — International</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Determines the bank fields below.</p>
            </div>
          </div>

          {/* Recipient details — NGN */}
          {form.currency === "NGN" ? (
            <div className="space-y-4 rounded-xl border bg-muted/30 p-3">
              <p className="text-sm font-medium">Nigerian bank account</p>
              <div className="grid gap-1.5">
                <Label>Bank</Label>
                <Popover open={bankOpen} onOpenChange={setBankOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={bankOpen} className="w-full justify-between font-normal">
                      {selectedBank ? selectedBank.name : "Select bank"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search bank..." />
                      <CommandList className="max-h-[200px] overflow-y-auto">
                        <CommandEmpty>No bank found.</CommandEmpty>
                        <CommandGroup>
                          {banks.map((bank) => (
                            <CommandItem
                              key={bank.code}
                              value={bank.name}
                              onSelect={() => {
                                set("bank_code", bank.code);
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
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="emp-ngn-account">Account number</Label>
                <Input
                  id="emp-ngn-account"
                  inputMode="numeric"
                  maxLength={10}
                  value={form.account_number}
                  onChange={(e) => set("account_number", e.target.value.replace(/\D/g, ""))}
                  placeholder="0123456789"
                />
                {lookupLoading && <p className="text-sm text-muted-foreground">Verifying account...</p>}
                {!lookupLoading && lookupName && (
                  <p className="flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Account name: {lookupName}
                  </p>
                )}
                {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="emp-ngn-name">Account name</Label>
                <Input
                  id="emp-ngn-name"
                  value={form.account_name}
                  onChange={(e) => set("account_name", e.target.value)}
                  placeholder="Verified account name will appear here"
                  readOnly={!!lookupName}
                  className={lookupName ? "bg-muted" : ""}
                />
              </div>
            </div>
          ) : (
            /* Recipient details — USD */
            <div className="space-y-4 rounded-xl border bg-muted/30 p-3">
              <p className="text-sm font-medium">International recipient (USD)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="emp-usd-bank">Bank name</Label>
                  <Input id="emp-usd-bank" value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="e.g. JPMorgan Chase" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="emp-usd-swift">SWIFT code</Label>
                  <Input id="emp-usd-swift" value={form.swift_code} onChange={(e) => set("swift_code", e.target.value.toUpperCase())} placeholder="e.g. CHASUS33" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="emp-usd-routing">Routing number</Label>
                  <Input id="emp-usd-routing" value={form.routing_number} onChange={(e) => set("routing_number", e.target.value)} placeholder="e.g. 021000021" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="emp-usd-account">Account number / IBAN</Label>
                  <Input id="emp-usd-account" value={form.account_number} onChange={(e) => set("account_number", e.target.value)} placeholder="International account number" />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="emp-usd-address">Beneficiary address</Label>
                  <Input id="emp-usd-address" value={form.beneficiary_address} onChange={(e) => set("beneficiary_address", e.target.value)} placeholder="Street address" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="emp-usd-city">City</Label>
                  <Input id="emp-usd-city" value={form.beneficiary_city} onChange={(e) => set("beneficiary_city", e.target.value)} placeholder="e.g. New York" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="emp-usd-country">Country</Label>
                  <Input id="emp-usd-country" value={form.beneficiary_country} onChange={(e) => set("beneficiary_country", e.target.value)} placeholder="e.g. US" maxLength={5} />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || lookupLoading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EmployeeFormDialog;
