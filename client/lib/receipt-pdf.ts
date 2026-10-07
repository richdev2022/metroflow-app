/**
 * Client-side transaction receipt generation (jsPDF).
 *
 * Builds the official Metricorex transaction receipt for any ledger row from
 * GET /transfers (payouts AND wallet transactions — pending rows included,
 * the status is printed as-is). Everything user-visible is passed through
 * scrubProviderNames() first so processor names can never leak into a
 * downloaded document.
 *
 * Layout: brand header (logo-mark.png + "METRICOREX" + "Official transaction
 * receipt"), an amount hero with color-coded status/type chips, a key/value
 * details block, an optional failure-reason block and a metricorex.com footer.
 */
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { resolveMediaUrl } from "@/lib/media-url";
import { scrubProviderNames } from "@/lib/scrub";
import type { Transfer } from "@shared/api";

const BRAND_BLUE: [number, number, number] = [67, 83, 255]; // #4353FF
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const LINE: [number, number, number] = [229, 231, 235];
const SOFT: [number, number, number] = [245, 246, 250];

const GREEN: [number, number, number] = [5, 150, 105]; // emerald-600
const RED: [number, number, number] = [220, 38, 38]; // red-600
const AMBER: [number, number, number] = [217, 119, 6]; // amber-600

const leading = (fontSize: number) => fontSize * 1.3;

function statusColor(status: string): [number, number, number] {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "successful" || s === "completed") return GREEN;
  if (s === "failed" || s === "reversed" || s === "cancelled") return RED;
  return AMBER; // pending / processing / anything in-flight
}

/** Fetch an image and convert to a data URL (null on any failure). */
async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** The official Metricorex logo — app origin first, then the API origin. */
async function loadBrandLogo(): Promise<string | null> {
  let apiCandidate = "";
  try {
    apiCandidate = resolveMediaUrl("/Assets/logo-mark.png");
  } catch {
    /* non-browser context — the app-origin path below still applies */
  }
  const candidates = ["/Assets/logo-mark.png", apiCandidate].filter(Boolean);
  for (const url of candidates) {
    const dataUrl = await loadImageDataUrl(url);
    if (dataUrl) return dataUrl;
  }
  return null;
}

function money(value: number | string | null | undefined, currency: string): string {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return `${currency} ${safe.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface ReceiptInput {
  transfer: Transfer;
  /** Human-readable bank name resolved from the /transfers/banks list. */
  bankName?: string | null;
}

/** True when the ledger row represents money IN (credits + refunds). */
export function isCreditRow(t: Transfer): boolean {
  if ((t.transaction_type || "").toLowerCase() === "refund") return true;
  return t.direction === "credit" || (t.type === "transaction" && t.direction !== "debit");
}

/** "Credit · transfer" / "Debit · bulk payout" style type label. */
export function typeLabel(t: Transfer): string {
  const kind = isCreditRow(t) ? "Credit" : "Debit";
  const channel = t.type === "transaction" ? (t.transaction_type || "wallet credit").replace(/_/g, " ") : "transfer";
  return `${kind} · ${channel}`;
}

export async function buildTransactionReceiptPdf(input: ReceiptInput): Promise<jsPDF> {
  const t = input.transfer;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const statusText = scrubProviderNames(t.status) || "unknown";
  const isFailed = String(t.status).toLowerCase() === "failed";
  const credit = isCreditRow(t);
  const statusCol = statusColor(t.status);

  let y = margin + 6;

  // ---- Brand header -------------------------------------------------------
  const logo = await loadBrandLogo();
  const logoSize = 16;
  let textX = margin;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", margin, y - 4, logoSize, logoSize);
      textX = margin + logoSize + 5;
    } catch {
      /* ignore malformed image — header text still renders */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BRAND_BLUE);
  doc.text("METRICOREX", textX, y + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("Official transaction receipt", textX, y + 9);
  doc.setFontSize(8.5);
  doc.text(
    `Generated ${format(new Date(), "MMM d, yyyy · h:mm a")}`,
    pageWidth - margin,
    y + 2,
    { align: "right" },
  );

  y += logoSize + 4;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  // ---- Amount hero ---------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(credit ? "AMOUNT RECEIVED" : "AMOUNT SENT", pageWidth / 2, y, { align: "center" });
  y += 12;
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  doc.text(money(t.amount, t.currency), pageWidth / 2, y, { align: "center" });
  y += 11;

  // Status + type chips (color-coded, centered side by side).
  const chipGap = 4;
  const statusLabel = statusText.toUpperCase();
  const typeLabelText = typeLabel(t).toUpperCase();
  doc.setFont("helvetica", "bold");
  const statusW = doc.getTextWidth(statusLabel) + 10;
  const typeW = doc.getTextWidth(typeLabelText) + 10;
  const totalW = statusW + chipGap + typeW;
  const startX = pageWidth / 2 - totalW / 2;
  const chipAt = (label: string, col: [number, number, number], x: number) => {
    doc.setFontSize(9);
    const w = doc.getTextWidth(label) + 10;
    doc.setFillColor(...col);
    doc.roundedRect(x, y - 4.6, w, 7.4, 3.7, 3.7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text(label, x + w / 2, y, { align: "center" });
  };
  chipAt(statusLabel, statusCol, startX);
  chipAt(typeLabelText, BRAND_BLUE, startX + statusW + chipGap);
  y += 14;

  // ---- Details block --------------------------------------------------------
  const rows: Array<[string, string]> = [
    ["Reference", scrubProviderNames(t.reference) || "—"],
    ["Status", statusText.charAt(0).toUpperCase() + statusText.slice(1)],
    ["Type", typeLabel(t)],
    ["Amount", money(t.amount, t.currency)],
    ["Fee", money(t.fee, t.currency)],
  ];

  const counterparty = scrubProviderNames(
    t.recipient_name || t.description || (t.type === "transaction" ? "" : "—"),
  );
  if (counterparty) rows.push([credit ? "From" : "Beneficiary", counterparty]);

  const bankLabel = scrubProviderNames(
    input.bankName || (t.recipient_bank ? `Bank (${t.recipient_bank})` : ""),
  );
  if (bankLabel) rows.push(["Bank", bankLabel]);
  if (t.recipient_account) rows.push(["Account number", t.recipient_account]);

  rows.push([
    "Date",
    t.created_at ? format(new Date(t.created_at), "MMM d, yyyy · h:mm a") : "—",
  ]);
  const remark = scrubProviderNames(t.remark || "");
  if (remark) rows.push(["Remark", remark]);

  const valueX = margin + 42;
  for (const [label, value] of rows) {
    const lines = doc.splitTextToSize(value || "—", pageWidth - margin - valueX) as string[];
    const rowH = Math.max(1, lines.length) * leading(10) + 3.5;

    // Page break with a light continuation header when the block runs over.
    if (y + rowH > pageHeight - margin - 22) {
      doc.setFillColor(...SOFT);
      doc.rect(margin, margin, contentWidth, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND_BLUE);
      doc.text("METRICOREX — transaction receipt (cont.)", margin + 3, margin + 8);
      doc.addPage();
      y = margin + 20;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(label, margin, y);
    doc.setTextColor(...INK);
    doc.text(lines, valueX, y);
    y += rowH;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(margin, y - 1.5, pageWidth - margin, y - 1.5);
  }
  y += 4;

  // ---- Failure reason (scrubbed) -------------------------------------------
  if (isFailed && t.failure_reason) {
    const reason = scrubProviderNames(t.failure_reason);
    const lines = doc.splitTextToSize(reason, contentWidth - 10) as string[];
    const boxH = lines.length * leading(10) + 12;
    if (y + boxH > pageHeight - margin - 22) {
      doc.addPage();
      y = margin + 10;
    }
    doc.setFillColor(254, 242, 242); // red-50
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, contentWidth, boxH, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...RED);
    doc.text("Failure reason", margin + 5, y + 6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(lines, margin + 5, y + 13);
    y += boxH + 6;
  }

  // ---- Footer ---------------------------------------------------------------
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.line(margin, pageHeight - margin - 6, pageWidth - margin, pageHeight - margin - 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("metricorex.com", margin, pageHeight - margin);
  doc.text(
    `Official transaction receipt · ${scrubProviderNames(t.reference) || ""}`,
    pageWidth - margin,
    pageHeight - margin,
    { align: "right" },
  );
  doc.setFontSize(7.5);
  doc.text(
    "This receipt was generated electronically and is valid without a signature.",
    pageWidth / 2,
    pageHeight - margin + 4.5,
    { align: "center" },
  );

  return doc;
}

/** Suggested download filename for a receipt. */
export function receiptFilename(t: Transfer): string {
  const ref = (t.reference || t.id || "receipt").replace(/[^A-Za-z0-9._-]+/g, "-");
  return `Metricorex-Receipt-${ref}.pdf`;
}
