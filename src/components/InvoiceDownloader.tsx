"use client";

import { useState } from "react";
import { FileText, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { canDownloadInvoice } from "@/lib/format";
import { InvoiceViewer } from "@/components/InvoiceViewer";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

interface InvoiceDownloaderProps {
  order: Order;
  variant?: "primary" | "outline" | "ghost";
  fullWidth?: boolean;
  className?: string;
}

/**
 * Opens the invoice in the app's own viewer.
 *
 * It used to open a blank tab and fire the OS print sheet 400ms later, which
 * on a phone meant the buyer's first sight of their bill was "Printer: Not
 * selected". It also depended on a popup surviving the browser's blocker, and
 * apologised with an alert() when it didn't. Showing the document in place
 * removes both problems: nothing is printed until Download is pressed, and
 * there is no popup to block.
 */
export function InvoiceDownloader({
  order,
  variant = "outline",
  fullWidth = false,
  className,
}: InvoiceDownloaderProps) {
  const [open, setOpen] = useState(false);

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
    <>
      <Button
        variant={variant}
        fullWidth={fullWidth}
        className={cn(className)}
        leadingIcon={<FileText className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        View invoice
      </Button>
      <InvoiceViewer order={order} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
