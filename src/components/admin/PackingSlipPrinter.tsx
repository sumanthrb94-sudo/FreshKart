"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { buildPackingSlipsHTML } from "@/lib/packing-slip-html";
import type { DailyPackingReport } from "@/lib/packing";

/** Opens the day's pick list + packing slips in a new tab and prints them.
 *
 *  Same browser print-to-PDF approach as the invoice — no library, works
 *  everywhere, and the packers can hit "Save as PDF" if they'd rather file it.
 */
export function PackingSlipPrinter({
  report,
  variant = "outline",
}: {
  report: DailyPackingReport;
  variant?: "primary" | "outline" | "ghost";
}) {
  const [status, setStatus] = useState<"idle" | "generating" | "done">("idle");
  const empty = report.slips.length === 0;

  const print = useCallback(() => {
    setStatus("generating");

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStatus("idle");
      alert("Please allow popups to print the packing slips.");
      return;
    }

    printWindow.document.write(buildPackingSlipsHTML(report));
    printWindow.document.close();

    // Give the styles a moment to apply before the print dialog opens.
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    }, 400);
  }, [report]);

  return (
    <Button
      variant={variant}
      loading={status === "generating"}
      disabled={status !== "idle" || empty}
      leadingIcon={
        status === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Printer className="h-4 w-4" />
        )
      }
      onClick={print}
    >
      {status === "done" ? "Opened" : "Print slips"}
    </Button>
  );
}
