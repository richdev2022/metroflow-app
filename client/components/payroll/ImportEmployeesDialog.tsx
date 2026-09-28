import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ParsedEmployeeRow {
  row: number;
  name: string;
  email: string;
  role: string;
  salary: string;
  salaryCurrency: string;
  bankCode: string;
  bankAccountNumber: string;
  accountName: string;
  contractStartDate: string;
  errors: string[];
}

export interface ImportResultRow {
  row: number;
  success: boolean;
  action?: string;
  name?: string;
  email?: string;
  error?: string;
  inviteLink?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  failed: number;
  results: ImportResultRow[];
}

interface ImportEmployeesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful import so the parent can refetch employees */
  onImported?: () => void;
}

/* ------------------------------------------------------------------ */
/* Column mapping (template headers + common alternates)               */
/* ------------------------------------------------------------------ */

const normalizeKey = (key: string) => String(key).toLowerCase().replace(/[^a-z0-9]/g, "");

const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["name", "employeename", "fullname", "employee", "staffname"],
  email: ["email", "employeeemail", "emailaddress", "officialemail", "workemail"],
  role: ["role", "jobtitle", "position", "designation", "department"],
  salary: ["salary", "salaryamount", "netsalary", "basicsalary", "monthlysalary", "pay"],
  salaryCurrency: ["salarycurrency", "currency", "currencysymbol", "currencycode"],
  bankCode: ["bankcode", "bank", "bankname", "bankinstitution"],
  bankAccountNumber: [
    "bankaccountnumber",
    "accountnumber",
    "accountno",
    "bankaccount",
    "account",
    "acctnumber",
  ],
  accountName: ["accountname", "accounttitle", "acctname", "bankaccountname"],
  contractStartDate: [
    "contractstartdate",
    "contractstartdateyyyymmdd",
    "contractstart",
    "startdate",
    "employmentstartdate",
    "commencementdate",
  ],
};

function pickField(row: Record<string, any>, field: string): string {
  const aliases = COLUMN_ALIASES[field] || [field];
  const normalizedRow: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    normalizedRow[normalizeKey(key)] = row[key];
  }
  for (const alias of aliases) {
    const value = normalizedRow[alias];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRow(row: ParsedEmployeeRow, seenEmails: Set<string>): string[] {
  const errors: string[] = [];
  if (!row.name) errors.push("Name is required");
  if (!row.email) {
    errors.push("Email is required");
  } else if (!EMAIL_RE.test(row.email)) {
    errors.push("Invalid email address");
  } else if (seenEmails.has(row.email.toLowerCase())) {
    errors.push("Duplicate email in file");
  }
  if (row.salary) {
    const numeric = Number(row.salary.replace(/,/g, ""));
    if (isNaN(numeric) || numeric < 0) errors.push("Salary must be a number");
  }
  return errors;
}

function parseWorkbook(file: File): Promise<ParsedEmployeeRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error("Could not read file"));
          return;
        }
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
          defval: "",
        });

        const seenEmails = new Set<string>();
        const rows: ParsedEmployeeRow[] = json
          .map((raw, index) => {
            const salary = formatValue(pickField(raw, "salary"));
            const parsed: ParsedEmployeeRow = {
              row: index + 2, // +2 = 1-indexed rows after the header row
              name: formatValue(pickField(raw, "name")),
              email: formatValue(pickField(raw, "email")),
              role: formatValue(pickField(raw, "role")),
              salary: salary ? salary.replace(/,/g, "") : "",
              salaryCurrency: formatValue(pickField(raw, "salaryCurrency")),
              bankCode: formatValue(pickField(raw, "bankCode")),
              bankAccountNumber: formatValue(pickField(raw, "bankAccountNumber")),
              accountName: formatValue(pickField(raw, "accountName")),
              contractStartDate: formatValue(pickField(raw, "contractStartDate")),
              errors: [],
            };
            return parsed;
          })
          .filter((r) => Object.values(r).some((v) => typeof v === "string" && v !== ""));

        // Second pass so duplicate-email detection sees all rows
        for (const row of rows) {
          row.errors = validateRow(row, seenEmails);
          if (row.email && !row.errors.includes("Invalid email address")) {
            seenEmails.add(row.email.toLowerCase());
          }
        }

        resolve(rows);
      } catch (err: any) {
        reject(new Error(err?.message || "Failed to parse file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

/* ------------------------------------------------------------------ */
/* Template download                                                   */
/* ------------------------------------------------------------------ */

const TEMPLATE_HEADERS = [
  "Name",
  "Email",
  "Role",
  "Salary",
  "Salary Currency",
  "Bank Code",
  "Bank Account Number",
  "Account Name",
  "Contract Start Date (YYYY-MM-DD)",
];

export function downloadEmployeeTemplate() {
  const example = [
    "Jane Doe",
    "jane.doe@example.com",
    "Manager",
    350000,
    "NGN",
    "044",
    "0123456789",
    "Jane Doe",
    "2025-01-01",
  ];
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, example]);
  ws["!cols"] = [
    { wch: 20 },
    { wch: 28 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 10 },
    { wch: 22 },
    { wch: 20 },
    { wch: 30 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, "payroll_employees_template.xlsx");
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export function ImportEmployeesDialog({ open, onOpenChange, onImported }: ImportEmployeesDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedEmployeeRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copiedRow, setCopiedRow] = useState<number | null>(null);

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const invalidCount = parsedRows.length - validRows.length;

  const reset = () => {
    setFile(null);
    setParsedRows([]);
    setSummary(null);
    setParseError(null);
    setIsParsing(false);
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDialogChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleFileSelected = async (selected: File | null) => {
    setParseError(null);
    setSummary(null);
    if (!selected) {
      setFile(null);
      setParsedRows([]);
      return;
    }
    setFile(selected);
    setIsParsing(true);
    try {
      const rows = await parseWorkbook(selected);
      setParsedRows(rows);
      if (rows.length === 0) {
        setParseError("No data rows found in the file. Make sure the first sheet contains your employees.");
      }
    } catch (err: any) {
      setParsedRows([]);
      setParseError(err?.message || "Failed to parse file");
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setIsImporting(true);
    setParseError(null);
    try {
      const employees = validRows.map((row) => {
        const payload: Record<string, any> = {
          name: row.name,
          email: row.email,
        };
        if (row.role) payload.role = row.role;
        if (row.salary !== "") {
          const numeric = Number(row.salary);
          if (!isNaN(numeric)) payload.salary = numeric;
        }
        if (row.salaryCurrency) payload.salaryCurrency = row.salaryCurrency;
        if (row.bankCode) payload.bankCode = row.bankCode;
        if (row.bankAccountNumber) payload.bankAccountNumber = row.bankAccountNumber;
        if (row.accountName) payload.accountName = row.accountName;
        if (row.contractStartDate) payload.contractStartDate = row.contractStartDate;
        return payload;
      });

      const res = await api.post("/payroll/employees/import", { employees });
      const data = res.data?.data as ImportSummary | undefined;

      if (res.data?.success && data) {
        setSummary(data);
        onImported?.();
        toast({
          title: "Import finished",
          description: `${data.created} created, ${data.updated} updated, ${data.failed} failed`,
        });
      } else {
        setParseError(res.data?.error || "Failed to import employees");
      }
    } catch (err: any) {
      setParseError(
        err.response?.data?.error || err.response?.data?.message || "Failed to import employees"
      );
    } finally {
      setIsImporting(false);
    }
  };

  const copyInviteLink = async (row: number, link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedRow(row);
      toast({ title: "Copied", description: "Invite link copied to clipboard" });
      setTimeout(() => setCopiedRow(null), 2000);
    } catch {
      toast({ title: "Error", description: "Could not copy link", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Employees</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file to bulk-create (or update) payroll employees. New
            employees receive an invite email automatically.
          </DialogDescription>
        </DialogHeader>

        {/* How it works */}
        <Alert className="border-primary/20 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            <span className="font-medium">How it works:</span> download the template, fill one
            row per employee (Name and Email are required, Salary must be a number), then upload
            it below. Existing employees (matched by email) are updated instead of duplicated.
          </AlertDescription>
        </Alert>

        {parseError && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}

        {summary ? (
          /* ---------------- Results view ---------------- */
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-3 text-center ring-1 ring-inset ring-emerald-500/20">
                <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                  {summary.created}
                </p>
                <p className="text-xs font-medium text-emerald-700/80 dark:text-emerald-400/80">
                  Created
                </p>
              </div>
              <div className="rounded-xl bg-primary/10 p-3 text-center ring-1 ring-inset ring-primary/20">
                <p className="text-2xl font-semibold text-primary">{summary.updated}</p>
                <p className="text-xs font-medium text-primary/80">Updated</p>
              </div>
              <div className="rounded-xl bg-red-500/10 p-3 text-center ring-1 ring-inset ring-red-500/20">
                <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
                  {summary.failed}
                </p>
                <p className="text-xs font-medium text-red-700/80 dark:text-red-400/80">Failed</p>
              </div>
            </div>

            <div className="rounded-xl border border-border">
              <div className="border-b border-border px-4 py-2.5 text-sm font-medium">
                Row results
              </div>
              <ScrollArea className="max-h-64">
                <div className="divide-y divide-border/60">
                  {summary.results.map((result) => (
                    <div key={result.row} className="flex items-start gap-3 px-4 py-2.5">
                      <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                        #{result.row}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {result.name || "—"}{" "}
                          <span className="font-normal text-muted-foreground">
                            {result.email}
                          </span>
                        </p>
                        {result.success ? (
                          result.inviteLink ? (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              Created, but the invite email could not be sent — share the invite
                              link manually.
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {result.action === "updated" ? "Employee updated" : "Employee created"}
                            </p>
                          )
                        ) : (
                          <p className="text-xs text-red-600 dark:text-red-400">
                            {result.error || "Import failed"}
                          </p>
                        )}
                        {result.inviteLink && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <code className="max-w-[240px] truncate rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {result.inviteLink}
                            </code>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 gap-1 px-2 text-xs"
                              onClick={() => copyInviteLink(result.row, result.inviteLink!)}
                            >
                              {copiedRow === result.row ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              {copiedRow === result.row ? "Copied" : "Copy link"}
                            </Button>
                          </div>
                        )}
                      </div>
                      {result.success ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        >
                          {result.action || "ok"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0 bg-red-500/10 text-red-700 dark:text-red-400">
                          failed
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => {
                  setSummary(null);
                  setFile(null);
                  setParsedRows([]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                Import another file
              </Button>
              <Button onClick={() => handleDialogChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          /* ---------------- Upload / preview view ---------------- */
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="outline" size="sm" onClick={downloadEmployeeTemplate} className="gap-2">
                <Download className="h-4 w-4" />
                Download template
              </Button>
              <p className="text-xs text-muted-foreground">
                Accepted: .xlsx, .xls, .csv — up to 500 rows
              </p>
            </div>

            <div>
              <Label htmlFor="payroll-import-file">Employee file</Label>
              <Input
                id="payroll-import-file"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
                className="mt-1.5 cursor-pointer"
              />
              {file && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  {file.name}
                  {isParsing && <Loader2 className="h-3 w-3 animate-spin" />}
                </p>
              )}
            </div>

            {isParsing && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Parsing file...
              </div>
            )}

            {!isParsing && parsedRows.length > 0 && (
              <div className="rounded-xl border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                  <p className="text-sm font-medium">
                    Preview · {parsedRows.length} row{parsedRows.length === 1 ? "" : "s"}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {validRows.length} valid
                    </span>
                    {invalidCount > 0 && (
                      <span className="text-red-600 dark:text-red-400">{invalidCount} invalid</span>
                    )}
                  </div>
                </div>
                <ScrollArea className="max-h-64">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="w-10 px-3 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Role</th>
                        <th className="px-3 py-2 font-medium">Salary</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row) => (
                        <tr
                          key={row.row}
                          className={cn(
                            "border-t border-border/60",
                            row.errors.length > 0 && "bg-red-500/5"
                          )}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {row.row}
                          </td>
                          <td className="max-w-[120px] truncate px-3 py-2">{row.name || "—"}</td>
                          <td className="max-w-[160px] truncate px-3 py-2">{row.email || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.role || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.salary || "—"}</td>
                          <td className="px-3 py-2">
                            {row.errors.length === 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Ready
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
                                title={row.errors.join("; ")}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                {row.errors[0]}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => handleDialogChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={validRows.length === 0 || isImporting || isParsing}
                className="gap-2"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Import {validRows.length} employee{validRows.length === 1 ? "" : "s"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ImportEmployeesDialog;
