import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Landmark,
  Loader2,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types (mirror the /business-kyc backend contracts)
// ---------------------------------------------------------------------------

type LimitTriple = {
  singleTransactionLimit: number;
  dailyLimit: number;
  monthlyLimit: number;
};

type ConfigDocument = {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
};

type ConfigRegistrationType = {
  id: string;
  label: string;
  authority?: string;
  docPack?: "cac" | "generic" | string;
  description?: string;
  documents: ConfigDocument[];
};

type BusinessKycConfig = {
  registrationTypes: ConfigRegistrationType[];
  limits: {
    nonRegistered: LimitTriple;
    registered: LimitTriple;
  };
};

type StatusDocument = {
  kind: string;
  label?: string;
  url?: string;
  filename?: string;
  mime?: string;
  size?: number;
};

type StatusSubmission = {
  id?: string;
  registrationType?: string;
  registrationTypeLabel?: string;
  businessDescription?: string;
  documents?: StatusDocument[];
  status?: "pending" | "approved" | "rejected" | string;
  adminNotes?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
};

type BusinessKycStatus = {
  business: {
    id?: string;
    name?: string;
    registrationCategory?: "non_registered" | "registered" | string;
    isRegistered?: boolean;
    registrationType?: string | null;
    requestedRegistrationCategory?: string | null;
    categoryUpdatedAt?: string | null;
  };
  latestSubmission: StatusSubmission | null;
  submissionHistory?: {
    id?: string;
    status?: string;
    registrationTypeLabel?: string;
    createdAt?: string;
    reviewedAt?: string | null;
    adminNotes?: string | null;
  }[];
  limits: {
    category?: string;
    isRegistered?: boolean;
    currency?: string;
    limits: LimitTriple;
    usage?: {
      usedToday?: number;
      usedThisMonth?: number;
      remainingToday?: number;
      remainingThisMonth?: number;
    };
    registeredLimits?: LimitTriple;
  };
  canUpgrade?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ngn = (v: unknown) => `₦${(Number(v) || 0).toLocaleString()}`;

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const fmtSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MAX_FILE_MB = 10;
const ACCEPTED_MIMES = ["image/", "application/pdf"];

const isAcceptedFile = (file: File) => {
  const mime = (file.type || "").toLowerCase();
  if (ACCEPTED_MIMES.some((m) => mime.startsWith(m))) return true;
  // Fallback for browsers that report an empty mime: check the extension.
  return /\.(png|jpe?g|gif|webp|heic|pdf)$/i.test(file.name || "");
};

const isCacType = (t: ConfigRegistrationType) =>
  t.docPack === "cac" || (t.id || "").startsWith("cac_");

// ---------------------------------------------------------------------------

export default function BusinessKycUpgrade() {
  const { toast } = useToast();

  const [status, setStatus] = useState<BusinessKycStatus | null>(null);
  const [config, setConfig] = useState<BusinessKycConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [submitting, setSubmitting] = useState(false);

  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchStatus = useCallback(async () => {
    const res = await api.get("/business-kyc/status");
    setStatus((res.data?.data || res.data) as BusinessKycStatus);
  }, []);

  const fetchConfig = useCallback(async () => {
    const res = await api.get("/business-kyc/config");
    setConfig((res.data?.data || res.data) as BusinessKycConfig);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([fetchStatus(), fetchConfig()]);
    } catch (err: any) {
      console.error("Failed to load business KYC data:", err);
      setLoadError(
        err?.response?.data?.error || err?.message || "Could not load your business verification status",
      );
    } finally {
      setLoading(false);
    }
  }, [fetchStatus, fetchConfig]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const business = status?.business;
  const latest = status?.latestSubmission ?? null;
  const isPending = latest?.status === "pending";
  const isRejected = !isPending && latest?.status === "rejected";
  const isVerified = business?.isRegistered === true || business?.registrationCategory === "registered";

  const selectedType = useMemo(
    () => config?.registrationTypes?.find((t) => t.id === selectedTypeId) || null,
    [config, selectedTypeId],
  );

  const requiredDocs = useMemo(
    () =>
      (selectedType?.documents || []).filter(
        (d) => d.required !== false,
      ),
    [selectedType],
  );

  const registeredLimits =
    status?.limits?.registeredLimits || config?.limits?.registered || null;
  const currentLimits = status?.limits?.limits || null;
  const usage = status?.limits?.usage || null;

  const resetWizard = () => {
    setStep(1);
    setSelectedTypeId("");
    setDescription("");
    setFiles({});
  };

  const handlePickFile = (docId: string, file: File | null) => {
    if (!file) return;
    if (!isAcceptedFile(file)) {
      toast({
        title: "Unsupported file type",
        description: `${file.name} must be an image or a PDF.`,
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast({
        title: "File too large",
        description: `${file.name} is larger than ${MAX_FILE_MB}MB. Please upload a smaller file.`,
        variant: "destructive",
      });
      return;
    }
    setFiles((prev) => ({ ...prev, [docId]: file }));
  };

  const handleSubmit = async () => {
    if (!selectedType) return;

    const missing = requiredDocs.filter((d) => !files[d.id]);
    if (missing.length > 0) {
      toast({
        title: "Documents missing",
        description: `Please upload: ${missing.map((d) => d.label).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);

      const fd = new FormData();
      fd.append("registrationType", selectedType.id);
      fd.append("businessDescription", description.trim());
      // docKinds MUST stay aligned BY INDEX with the "documents" files, so we
      // append kinds in the exact order the files are appended below.
      const kinds: string[] = [];
      for (const doc of requiredDocs) {
        const file = files[doc.id];
        if (file) {
          fd.append("documents", file);
          kinds.push(doc.id);
        }
      }
      fd.append("docKinds", JSON.stringify(kinds));

      await api.post("/business-kyc/submit", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        // Uploads can outlive the client's default 45s hard cap.
        timeout: 120_000,
      });

      toast({
        title: "Verification submitted",
        description: "We'll review your documents and notify you once approved.",
      });
      resetWizard();
      await fetchStatus();
    } catch (err: any) {
      const res = err?.response;
      const resCode: string = res?.data?.code || "";
      const serverError: string =
        res?.data?.error || res?.data?.message || "Failed to submit verification";

      if (res?.status === 409 || resCode === "SUBMISSION_PENDING") {
        toast({
          title: "Verification already under review",
          description: serverError,
        });
        resetWizard();
        try {
          await fetchStatus();
        } catch {
          /* keep whatever view we have */
        }
        return;
      }

      if (resCode === "DOCUMENTS_MISSING" && Array.isArray(res?.data?.data?.missing)) {
        const missing: string[] = res.data.data.missing;
        toast({
          title: "Documents missing",
          description: `Server is still waiting for: ${missing.join(", ")}`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title:
          resCode === "DESCRIPTION_TOO_SHORT"
            ? "Description too short"
            : resCode === "INVALID_REGISTRATION_TYPE"
              ? "Invalid registration type"
              : resCode === "FILE_TOO_LARGE"
                ? "File too large"
                : resCode === "STORAGE_UNAVAILABLE"
                  ? "Uploads temporarily unavailable"
                  : "Submission failed",
        description: serverError,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------

  const renderLimits = (
    limits: LimitTriple | null,
    title: string,
    extra?: React.ReactNode,
  ) => {
    if (!limits) return null;
    return (
      <div className="rounded-xl border border-border/70 bg-background/60 p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Landmark className="h-3.5 w-3.5 text-primary" /> {title}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Per transaction</p>
            <p className="text-sm font-semibold text-foreground">
              {ngn(limits.singleTransactionLimit)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Daily</p>
            <p className="text-sm font-semibold text-foreground">{ngn(limits.dailyLimit)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Monthly</p>
            <p className="text-sm font-semibold text-foreground">{ngn(limits.monthlyLimit)}</p>
          </div>
        </div>
        {usage && (
          <p className="mt-3 text-xs text-muted-foreground">
            Used today {ngn(usage.usedToday)} · This month {ngn(usage.usedThisMonth)}
            {typeof usage.remainingToday === "number" &&
              ` · ${ngn(usage.remainingToday)} left today`}
          </p>
        )}
        {extra}
      </div>
    );
  };

  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <Layout>
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading your business verification…</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (loadError || !status) {
    return (
      <Layout>
        <div className="mx-auto max-w-xl space-y-4 py-10">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm text-muted-foreground">
                {loadError || "Could not load your business verification status."}
              </p>
              <Button variant="outline" onClick={loadAll} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Review-pending view (no form)
  if (isPending) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl space-y-6 py-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Business verification
            </h1>
            <p className="text-sm text-muted-foreground">
              Upgrade to a Registered Business (Verified) account.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-300/70 bg-amber-50 p-5 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Clock className="h-5 w-5" />
              </span>
              <div className="min-w-0 space-y-2">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Your {latest?.registrationTypeLabel || "business"} verification is under review
                </p>
                <p className="text-sm text-amber-800/90 dark:text-amber-300/90">
                  Submitted on {fmtDate(latest?.createdAt)}. We'll notify you as soon as an admin
                  reviews your documents — no further action is needed.
                </p>
                {!!latest?.documents?.length && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-800/80 dark:text-amber-400/80">
                      Documents submitted
                    </p>
                    {latest.documents.map((doc, i) => (
                      <div
                        key={`${doc.kind}-${i}`}
                        className="flex items-center gap-2 text-sm text-amber-900/90 dark:text-amber-200/90"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{doc.label || doc.kind}</span>
                        {doc.filename && (
                          <span className="truncate text-xs text-amber-700/70 dark:text-amber-400/70">
                            ({doc.filename}
                            {doc.size ? `, ${fmtSize(doc.size)}` : ""})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {renderLimits(currentLimits, "Your current transaction limits")}
        </div>
      </Layout>
    );
  }

  // Verified view
  if (isVerified) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl space-y-6 py-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Business verification
            </h1>
            <p className="text-sm text-muted-foreground">
              Upgrade to a Registered Business (Verified) account.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-300/70 bg-emerald-50 p-5 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-950/30">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                  Registered Business (Verified)
                </p>
                <p className="text-sm text-emerald-800/90 dark:text-emerald-300/90">
                  {business?.name
                    ? `${business.name} is fully verified.`
                    : "Your business is fully verified."}{" "}
                  You're enjoying the highest transaction limits — nothing else to do here.
                </p>
              </div>
            </div>
          </div>

          {renderLimits(currentLimits, "Your transaction limits")}
        </div>
      </Layout>
    );
  }

  // Wizard (first submission OR resubmission after a rejection)
  return (
    <Layout>
      <div className="mx-auto max-w-3xl space-y-6 py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Business verification
          </h1>
          <p className="text-sm text-muted-foreground">
            Upgrade to a Registered Business (Verified) account and unlock higher limits.
          </p>
        </div>

        {isRejected && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
                <XCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-destructive">
                  Your previous verification was rejected
                </p>
                {latest?.reviewedAt && (
                  <p className="text-xs text-muted-foreground">
                    Reviewed on {fmtDate(latest.reviewedAt)}
                  </p>
                )}
                {latest?.adminNotes && (
                  <p className="text-sm text-foreground/90">
                    <span className="font-medium">Reason: </span>
                    {latest.adminNotes}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Fix the issue and resubmit below — your new documents will replace the old
                  submission.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step progress indicator */}
        <div className="flex items-center gap-2" aria-label={`Step ${step} of 3`}>
          {([1, 2, 3] as const).map((n, idx) => (
            <React.Fragment key={n}>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  n === step
                    ? "border-primary bg-primary/10 text-primary"
                    : n < step
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-border/70 bg-card/60 text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                    n === step
                      ? "bg-primary text-primary-foreground"
                      : n < step
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {n < step ? <CheckCircle2 className="h-3 w-3" /> : n}
                </span>
                {n === 1 ? "Business type" : n === 2 ? "Description" : "Documents"}
              </div>
              {idx < 2 && <div className="h-px flex-1 bg-border/70" />}
            </React.Fragment>
          ))}
        </div>

        <Card className="rounded-2xl border-border/60 bg-card/60 shadow-sm backdrop-blur">
          <CardContent className="p-4 sm:p-6">
            {/* ---------------- Step 1: registration type ---------------- */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <p className="font-semibold text-foreground">Choose your business type</p>
                  <p className="text-sm text-muted-foreground">
                    Pick the registration that matches your documents — CAC-registered entities
                    first.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      CAC-registered (Nigeria)
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(config?.registrationTypes || [])
                        .filter(isCacType)
                        .map((t) => (
                          <TypeCard
                            key={t.id}
                            type={t}
                            selected={selectedTypeId === t.id}
                            onSelect={() => {
                              setSelectedTypeId(t.id);
                              setFiles({});
                            }}
                          />
                        ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Other business types
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(config?.registrationTypes || [])
                        .filter((t) => !isCacType(t))
                        .map((t) => (
                          <TypeCard
                            key={t.id}
                            type={t}
                            selected={selectedTypeId === t.id}
                            onSelect={() => {
                              setSelectedTypeId(t.id);
                              setFiles({});
                            }}
                          />
                        ))}
                    </div>
                  </div>
                </div>

                {selectedType && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <FileText className="h-4 w-4 text-primary" /> Required documents —{" "}
                      {selectedType.label}
                    </p>
                    <ul className="space-y-1.5">
                      {requiredDocs.map((d) => (
                        <li key={d.id} className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{d.label}</span>
                          {d.description ? ` — ${d.description}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    disabled={!selectedType}
                    onClick={() => setStep(2)}
                    className="gap-2"
                  >
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ---------------- Step 2: description ---------------- */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <p className="font-semibold text-foreground">Describe your business</p>
                  <p className="text-sm text-muted-foreground">
                    Tell us what {selectedType?.label || "your business"} does — at least 20
                    characters.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="businessDescription" className="text-sm font-medium">
                    Business description
                  </Label>
                  <Textarea
                    id="businessDescription"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. We are a logistics company in Lagos that moves goods for SMEs across Nigeria."
                    rows={5}
                    className="resize-none rounded-xl border-border/70 bg-background/60 focus-visible:ring-2 focus-visible:ring-primary/60"
                  />
                  <p
                    className={cn(
                      "text-right text-xs",
                      description.trim().length >= 20 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {description.trim().length}/20 characters minimum
                  </p>
                </div>

                {registeredLimits && (
                  <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 text-primary" /> What approval unlocks
                    </p>
                    <p className="text-sm text-muted-foreground">
                      After approval you'll unlock: single{" "}
                      <span className="font-semibold text-foreground">
                        {ngn(registeredLimits.singleTransactionLimit)}
                      </span>{" "}
                      / daily{" "}
                      <span className="font-semibold text-foreground">
                        {ngn(registeredLimits.dailyLimit)}
                      </span>{" "}
                      / monthly{" "}
                      <span className="font-semibold text-foreground">
                        {ngn(registeredLimits.monthlyLimit)}
                      </span>
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button
                    disabled={description.trim().length < 20}
                    onClick={() => setStep(3)}
                    className="gap-2"
                  >
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ---------------- Step 3: document uploads ---------------- */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <p className="font-semibold text-foreground">Upload your documents</p>
                  <p className="text-sm text-muted-foreground">
                    Images or PDFs only, up to {MAX_FILE_MB}MB each — {selectedType?.label}{" "}
                    requires {requiredDocs.length} document
                    {requiredDocs.length === 1 ? "" : "s"}.
                  </p>
                </div>

                <div className="space-y-3">
                  {requiredDocs.map((doc) => {
                    const file = files[doc.id] || null;
                    return (
                      <div key={doc.id}>
                        <input
                          ref={(el) => {
                            fileInputs.current[doc.id] = el;
                          }}
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const picked = e.target.files?.[0] || null;
                            handlePickFile(doc.id, picked);
                            // Allow re-picking the same file.
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputs.current[doc.id]?.click()}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border border-dashed p-4 text-left transition-colors",
                            file
                              ? "border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10"
                              : "border-border bg-background/60 hover:border-primary/40 hover:bg-accent/40",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                              file
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {file ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-foreground">
                              {doc.label}
                            </span>
                            {file ? (
                              <span className="block truncate text-xs text-muted-foreground">
                                {file.name}
                                {file.size ? ` · ${fmtSize(file.size)}` : ""}
                              </span>
                            ) : (
                              <span className="block text-xs text-muted-foreground">
                                Click to upload
                                {doc.description ? ` — ${doc.description}` : ""}
                              </span>
                            )}
                          </span>
                          <Badge variant={file ? "default" : "outline"} className="shrink-0">
                            {file ? "Ready" : "Required"}
                          </Badge>
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(2)}
                    disabled={submitting}
                    className="gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                      </>
                    ) : (
                      <>
                        Review &amp; Submit <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Registration-type card (step 1 grid)
// ---------------------------------------------------------------------------

function TypeCard({
  type,
  selected,
  onSelect,
}: {
  type: ConfigRegistrationType;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-2xl border p-4 text-left shadow-sm backdrop-blur transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
          : "border-border/70 bg-background/60 hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Building2 className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">
            {type.label}
          </span>
          {type.authority && (
            <span className="block truncate text-xs text-muted-foreground">
              {type.authority}
            </span>
          )}
        </span>
        {selected && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-primary" />}
      </span>
      {type.description && (
        <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
          {type.description}
        </span>
      )}
    </button>
  );
}
