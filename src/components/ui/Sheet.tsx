"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { AnimatePresence, m, useReducedMotion, type PanInfo } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet on mobile (brief §3.7): full-viewport scrim, content slides up
 * with rounded top corners, max-height 88vh, scrollable body, sticky header
 * with a title + close. At the `lg` breakpoint this becomes a centered modal
 * dialog instead — rounded on all corners, capped width — matching how
 * desktop SaaS products (Stripe, Linear, Shopify admin) present the same
 * "focused task" surface a mobile bottom sheet is for, rather than a bottom
 * sheet stretched edge-to-edge across a 1440px viewport.
 *
 * It animates BOTH ways. It used to slide up via a CSS class and then simply
 * cease to exist, because `if (!open) return null` leaves React nothing to
 * animate out — so every dismissal was a hard cut, on the app's primary modal.
 * AnimatePresence keeps it mounted long enough to leave properly.
 *
 * On touch it can also be thrown downwards to dismiss, which is how a sheet is
 * expected to behave on a phone and was the one gesture this app had nowhere.
 */

/** Past this far down, or this fast, let go and it closes. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 520;

export function Sheet({
  open,
  onClose,
  title,
  scrimClassName,
  headerAccessory,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  scrimClassName?: string;
  headerAccessory?: React.ReactNode;
  children: React.ReactNode;
  /** Desktop modal width: md (~32rem, forms) or lg (~40rem, detail views with more content). */
  size?: "md" | "lg";
}) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-center lg:left-[var(--sidebar-width)] lg:items-center lg:p-6">
          <m.div
            className={cn("absolute inset-0 bg-black/40", scrimClassName)}
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
          />
          <m.div
            className={cn(
              "relative mt-auto flex max-h-[88vh] w-full max-w-app flex-col rounded-t-2xl bg-canvas shadow-xl",
              "lg:mt-0 lg:max-h-[85vh] lg:rounded-2xl",
              size === "lg" ? "lg:max-w-2xl" : "lg:max-w-lg"
            )}
            initial={reduced ? { opacity: 0 } : { y: "100%" }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: "100%" }}
            transition={
              reduced ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38, mass: 0.9 }
            }
            // Downwards only, and it springs back if the throw was too gentle.
            // `dragElastic: 0` upwards stops the sheet being pulled off the top
            // of the screen, which looks broken rather than playful.
            drag={reduced ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={handleDragEnd}
          >
            {/* Grab handle — the affordance that says the sheet can be thrown
                away. Mobile only; the desktop presentation is a modal, which
                is not draggable. */}
            <div className="flex justify-center pt-2 lg:hidden" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-line" />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-2xl border-b border-line bg-surface px-5 py-4">
              <div className="flex items-center gap-2 text-lg font-bold text-fg">{title}</div>
              <div className="flex items-center gap-2">
                {headerAccessory}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-raised"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="fc-scroll flex-1 overflow-y-auto">{children}</div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
