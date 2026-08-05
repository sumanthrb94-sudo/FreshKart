"use client";

import { useCallback, useState } from "react";
import { FileText, CheckCircle2, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  formatCurrency,
  formatDate,
  PAYMENT_LONG,
  ORDER_STATUS_META,
  canDownloadInvoice,
} from "@/lib/format";
import { buildInvoiceHTML } from "@/lib/invoice-html";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

interface InvoiceDownloaderProps {
  order: Order;
  variant?: "primary" | "outline" | "ghost";
  fullWidth?: boolean;
  className?: string;
}

/** Generates a PDF invoice using browser print-to-PDF.
 *
 *  Opens a styled invoice in a new tab; the user hits Ctrl+P / Cmd+P and
 *  selects "Save as PDF".  No heavy libraries needed — works on every
 *  browser and keeps the bundle lean.
 */
export function InvoiceDownloader({
  order,
  variant = "outline",
  fullWidth = false,
  className,
}: InvoiceDownloaderProps) {
  const [status, setStatus] = useState<"idle" | "generating" | "done">("idle");

  const openInvoice = useCallback(() => {
    setStatus("generating");

    const invoiceHTML = buildInvoiceHTML(order);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStatus("idle");
      alert("Please allow popups to view the invoice.");
      return;
    }

    printWindow.document.write(invoiceHTML);
    printWindow.document.close();

    // Auto-trigger print dialog after a short delay for styles to load
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    }, 400);
  }, [order]);

  // No invoice for a cancelled order — there's nothing to bill.
  if (order.status === "CANCELLED") {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border border-line bg-raised px-3 py-2.5 text-xs font-medium text-fg-subtle",
          className
        )}
      >
        <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden />
        No invoice — order was cancelled
      </div>
    );
  }

  // Belt and braces — canDownloadInvoice only excludes CANCELLED, which the
  // branch above already handled. Kept so the two can never drift apart.
  if (!canDownloadInvoice(order.status)) return null;

  return (
    <Button
      variant={variant}
      fullWidth={fullWidth}
      className={cn(className)}
      loading={status === "generating"}
      disabled={status !== "idle"}
      leadingIcon={
        status === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <FileText className="h-4 w-4" />
        )
      }
      onClick={openInvoice}
    >
      {status === "generating"
        ? "Opening invoice…"
        : status === "done"
          ? "Invoice opened"
          : "Download Invoice"}
    </Button>
  );
}

/** Builds a self-contained, print-optimized HTML invoice. */
