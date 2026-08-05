"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { AnimatePresence, m, useDragControls, useReducedMotion, type PanInfo } from "motion/react";
import { buildInvoiceHTML } from "@/lib/invoice-html";
import type { Order } from "@/lib/types";

/**
 * The invoice, on screen, before anything is printed.
 *
 * Tapping "Invoice" used to open a blank tab and fire the operating system's
 * print sheet 400ms later — so on a phone the first thing a buyer saw was
 * "Printer: Not selected", with the document they actually wanted hidden
 * behind it. Nobody asked to print. They asked to see their bill.
 *
 * So the document is shown first, full screen, with two obvious controls:
 * download it, or close it. Printing only happens when Download is pressed.
 *
 * The document is rendered in an iframe rather than injected into the page.
 * The invoice is a complete HTML document with its own <style> block written
 * for print, and dropping that into the app would leak those rules into every
 * screen behind it. The iframe also means "download" can print JUST the
 * invoice — `contentWindow.print()` targets the frame, not the app around it.
 */
/** A4 at 96dpi. The invoice is laid out for paper, so it is rendered at paper
 *  width and scaled down to fit — the same thing a PDF reader does. Letting a
 *  390px phone lay it out instead reflowed the header into "INV-", "20260624-",
 *  "SK21RE" on three lines and squeezed the item table to nothing. */
const PAGE_WIDTH = 794;

export function InvoiceViewer({
  order,
  open,
  onClose,
}: {
  order: Order;
  open: boolean;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [fit, setFit] = useState({ scale: 1, offset: 0, stageHeight: 0 });
  const reduced = useReducedMotion();
  const dragControls = useDragControls();
  /** The document's own height, read once it has laid out at paper width. */
  const [docHeight, setDocHeight] = useState<number | null>(null);

  // Rebuilt only when the order changes — a settled adjustment reprices it,
  // and the viewer must show the current figure, not a cached one.
  const html = useMemo(() => buildInvoiceHTML(order, { embedded: true }), [order]);

  useEffect(() => {
    if (!open) return;
    setReady(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // The document behind a full-screen overlay must not scroll with it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  // Keep the page fitted as the viewport changes — rotating a phone is the
  // common case, and a stale scale leaves the document clipped or floating.
  useEffect(() => {
    if (!open) return;
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.clientWidth;
      const scale = Math.min(1, width / PAGE_WIDTH);
      // Centred once the page no longer needs shrinking, so a desktop viewer
      // does not leave it pinned to the left edge.
      setFit({
        scale,
        offset: Math.max(0, (width - PAGE_WIDTH * scale) / 2),
        stageHeight: stage.clientHeight,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [open]);

  // A short invoice would otherwise end mid-stage and leave a band of the
  // grey backdrop under it, which reads as a rendering fault rather than as
  // the end of the document. The page is stretched to at least fill the view;
  // its own background is white, so it simply continues.
  const pageHeight =
    docHeight === null
      ? null
      : fit.stageHeight > 0
        ? Math.max(docHeight, fit.stageHeight / fit.scale)
        : docHeight;

  function handleDragEnd(_: unknown, info: PanInfo) {
    // Same throw-to-dismiss thresholds as Sheet, so the two full-screen
    // surfaces in the app behave identically under the thumb.
    if (info.offset.y > 110 || info.velocity.y > 520) onClose();
  }

  async function handleDownload() {
    setPrinting(true);
    try {
      // A real vector PDF, generated on demand. The library is ~128 KB gzipped
      // and is imported inside this call, so it costs nothing until pressed.
      const { downloadInvoicePdf } = await import("@/lib/invoice-pdf");
      await downloadInvoicePdf(order);
    } catch {
      // Never leave the button dead. If PDF generation fails — an old browser,
      // a blocked download — fall back to printing the frame, which is what
      // this button did before and still reaches Save as PDF.
      try {
        frameRef.current?.contentWindow?.focus();
        frameRef.current?.contentWindow?.print();
      } catch {
        const blob = new Blob([buildInvoiceHTML(order)], { type: "text/html" });
        window.open(URL.createObjectURL(blob), "_blank");
      }
    } finally {
      setPrinting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
    <m.div
      className="fixed inset-0 z-[60] flex flex-col bg-canvas lg:left-[var(--sidebar-width)]"
      initial={reduced ? { opacity: 0 } : { y: "100%" }}
      animate={reduced ? { opacity: 1 } : { y: 0 }}
      exit={reduced ? { opacity: 0 } : { y: "100%" }}
      transition={
        reduced ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38, mass: 0.9 }
      }
      drag={reduced ? false : "y"}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.55 }}
      onDragEnd={handleDragEnd}
      // A drag can only be STARTED from the title bar. Left to listen on the
      // whole surface it would fight the document's own scrolling, and a buyer
      // reading down a two-page invoice would keep throwing it away by
      // accident.
      dragListener={false}
      dragControls={dragControls}
    >
      {/* Title bar — also the drag handle. */}
      <div
        onPointerDown={(e) => {
          if (!reduced) dragControls.start(e);
        }}
        className="flex shrink-0 touch-none items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3"
      >
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-fg">Invoice</p>
          <p className="truncate text-xs text-fg-subtle">{order.orderNumber}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close invoice"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-raised hover:text-fg"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* The document, laid out at paper width and scaled to fit. */}
      <div ref={stageRef} className="relative flex-1 overflow-y-auto bg-[#f3f4f6]">
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          </div>
        )}
        {/* A transform does not change the layout box, so the scaled page
            needs a spacer of its VISUAL height or the stage would scroll the
            full unscaled document. */}
        <div style={{ height: pageHeight ? pageHeight * fit.scale : "100%" }}>
        <iframe
          ref={frameRef}
          title={`Invoice ${order.orderNumber}`}
          srcDoc={html}
          onLoad={(e) => {
            // Measure the document so the frame can be exactly as tall as the
            // invoice. A fixed height either clipped a long order's item table
            // or left a screen of blank white under a short one.
            const doc = e.currentTarget.contentDocument;
            if (doc) setDocHeight(doc.documentElement.scrollHeight);
            setReady(true);
          }}
          // No allow-scripts: the invoice is static, and every buyer-supplied
          // field in it (name, address, notes) is escaped. Denying scripts
          // outright means a hole in that escaping still cannot run anything.
          // allow-modals is what lets print() work inside the frame.
          sandbox="allow-same-origin allow-modals"
          style={{
            width: PAGE_WIDTH,
            height: pageHeight ?? "100%",
            transform: `scale(${fit.scale})`,
            transformOrigin: "top left",
            marginLeft: fit.offset,
          }}
          className="block border-0 bg-white"
        />
        </div>
      </div>

      {/* Controls */}
      <div className="flex shrink-0 items-center gap-3 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-line py-3 text-sm font-bold text-fg-muted transition-colors hover:bg-raised"
        >
          Close
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!ready || printing}
          className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
        >
          {printing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download PDF
        </button>
      </div>
    </m.div>
      )}
    </AnimatePresence>
  );
}
