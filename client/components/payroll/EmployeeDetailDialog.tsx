import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Pencil, ShieldCheck, Mail, Building2, Wallet, Landmark, Globe } from "lucide-react";
import VerificationBadge from "@/components/payroll/VerificationBadge";
import { api } from "@/lib/api-client";
import type { PayrollDirectoryEmployee } from "@shared/api";

interface EmployeeDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: PayrollDirectoryEmployee | null;
  /** Opens the edit dialog for this employee */
  onEdit: (employee: PayrollDirectoryEmployee) => void;
  /** Called after a successful verification so the parent can refetch */
  onVerified?: () => void;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium" title={typeof value === "string" ? value : undefined}>
        {value || "—"}
      </p>
    </div>
  );
}

function maskAccount(account?: string | null): string {
  if (!account) return "—";
  const trimmed = String(account).trim();
  return trimmed.length > 4 ? `••••${trimmed.slice(-4)}` : trimmed;
}

/**
 * Employee detail modal: full profile, compensation and recipient/verification
 * information, with Edit and Verify-account actions.
 */
export function EmployeeDetailDialog({ open, onOpenChange, employee, onEdit, onVerified }: EmployeeDetailDialogProps) {
  const { toast } = useToast();
  const [verifying, setVerifying] = useState(false);

  if (!employee) return null;

  const isNgn = (employee.salary_currency || "NGN").toUpperCase() !== "USD";
  const needsVerification =
    (employee.verification_status || "unverified") !== "verified" && !!employee.bank_code && !!employee.account_number;

  const handleVerify = async () => {
    if (!employee) return;
    setVerifying(true);
    try {
      const res = await api.post(`/payroll/employees/${employee.id}/verify`);
      if (res.data?.success) {
        toast({
          title: "Account verified",
          description: `Resolved name: ${res.data?.data?.account_name || "—"}`,
        });
        onOpenChange(false);
        onVerified?.();
      } else {
        toast({
          title: "Verification failed",
          description: res.data?.error || "Could not verify this account",
          variant: "destructive",
        });
        onVerified?.();
      }
    } catch (e: any) {
      toast({
        title: "Verification failed",
        description: e.response?.data?.error || e.response?.data?.message || "Could not verify this account",
        variant: "destructive",
      });
      onVerified?.();
    } finally {
      setVerifying(false);
    }
  };

  const salary = employee.salary_amount ? Number(employee.salary_amount).toLocaleString() : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {(employee.name || "?")
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate">{employee.name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{employee.email}</span>
            </span>
          </DialogTitle>
          <DialogDescription>Payroll profile and payout recipient details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Employment */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary" /> Employment
            </h4>
            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3">
              <Detail label="Job title" value={employee.job_title} />
              <Detail label="Department" value={employee.department} />
              <Detail label="Role" value={<Badge variant="outline" className="capitalize font-normal">{employee.role || "member"}</Badge>} />
              <Detail label="Status" value={<Badge variant="secondary" className="font-normal capitalize">{employee.status || "active"}</Badge>} />
              <Detail label="Phone" value={employee.phone_number} />
              <Detail label="Joined" value={employee.created_at ? new Date(employee.created_at).toLocaleDateString() : undefined} />
            </div>
          </section>

          {/* Compensation */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Wallet className="h-4 w-4 text-primary" /> Compensation
            </h4>
            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3">
              <Detail
                label="Monthly salary"
                value={
                  employee.salary_amount ? (
                    <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/10 font-semibold">
                      {employee.salary_currency || "NGN"} {salary}
                    </Badge>
                  ) : (
                    "—"
                  )
                }
              />
              <Detail label="Currency" value={employee.salary_currency || "NGN"} />
            </div>
          </section>

          {/* Recipient details */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                {isNgn ? <Landmark className="h-4 w-4 text-primary" /> : <Globe className="h-4 w-4 text-primary" />}
                Payout recipient
              </h4>
              <VerificationBadge
                status={employee.verification_status}
                verifiedAccountName={employee.verified_account_name}
                error={employee.verification_error}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3">
              {isNgn ? (
                <>
                  <Detail label="Bank" value={employee.bank_name || employee.bank_code || undefined} />
                  <Detail label="Account number" value={<span className="font-mono">{maskAccount(employee.account_number)}</span>} />
                  <div className="col-span-2">
                    <Detail label="Account name" value={employee.account_name || undefined} />
                  </div>
                </>
              ) : (
                <>
                  <Detail label="Bank name" value={employee.bank_name} />
                  <Detail label="SWIFT code" value={employee.swift_code} />
                  <Detail label="Routing number" value={employee.routing_number} />
                  <Detail label="Account number" value={<span className="font-mono">{maskAccount(employee.account_number)}</span>} />
                  <div className="col-span-2">
                    <Detail
                      label="Beneficiary address"
                      value={[employee.beneficiary_address, employee.beneficiary_city, employee.beneficiary_country]
                        .filter(Boolean)
                        .join(", ") || undefined}
                    />
                  </div>
                </>
              )}
              {employee.verification_status === "verified" && employee.verified_account_name && (
                <div className="col-span-2">
                  <Detail label="Verified account name" value={employee.verified_account_name} />
                </div>
              )}
              {employee.verification_status === "failed" && employee.verification_error && (
                <div className="col-span-2">
                  <Detail label="Verification error" value={<span className="text-destructive">{employee.verification_error}</span>} />
                </div>
              )}
            </div>
          </section>
        </div>

        <Separator />

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onEdit(employee);
            }}
          >
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Button>
          {needsVerification && (
            <Button onClick={handleVerify} disabled={verifying}>
              {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Verify account
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EmployeeDetailDialog;
