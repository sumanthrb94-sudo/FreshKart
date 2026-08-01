"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, X } from "lucide-react";

/** Chrome's install event isn't in lib.dom yet — narrow it ourselves. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "No thanks" has to mean it.
 *
 * This used to be a module-level boolean, which reset on every full page
 * load — so the banner came back on every reload and every fresh tab, over
 * and over, which is exactly how it was reported. Whether a browser has been
 * asked to install is a property of THIS device, not of the account, so
 * localStorage is the right home for it and it doesn't reintroduce the
 * cross-device staleness the rest of the app moved to Firestore to avoid.
 * Wrapped because private-mode Safari throws on access.
 */
const DISMISSED_KEY = "gb.install-prompt-dismissed.v1";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* private mode — it will ask again next visit, which is the old behaviour */
  }
}

/**
 * Registers the service worker and surfaces a Chrome-style "Install app"
 * banner when the browser fires `beforeinstallprompt`. Mounted once in the
 * root layout so it's available on every screen.
 */
export function PwaRegistrar() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  // Staff never see this. The admin console and the delivery app are worked
  // in for hours at a time, and the banner is fixed to the bottom of the
  // viewport — on top of the bottom navigation, which is in normal flow. So
  // for the two people using the app most, it was covering the controls all
  // day to advertise something they have no reason to want.
  const isStaffScreen =
    pathname?.startsWith("/admin") || pathname?.startsWith("/driver") || false;

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW is a progressive enhancement — ignore failures */
      });
    }
  }, []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Always preventDefault, so Chrome's own bar stays suppressed even when
      // we choose not to show ours.
      e.preventDefault();
      if (wasDismissed()) return;
      // Already running as an installed app — there is nothing to install.
      if (window.matchMedia?.("(display-mode: standalone)").matches) return;
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    setVisible(false);
    setDeferred(null);
  }

  function dismiss() {
    setVisible(false);
    rememberDismissed();
  }

  if (!visible || isStaffScreen) return null;

  return (
    // Sits ABOVE the buyer's bottom navigation rather than on top of it: that
    // nav is in normal flow at the foot of the page, so anything fixed to
    // bottom-0 covers it.
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 mx-auto w-full max-w-app p-3 lg:bottom-4 lg:left-[var(--sidebar-width)] lg:mx-0 lg:max-w-none">
      <div className="animate-rise pointer-events-none flex items-center justify-center gap-3">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-brand-500/30 bg-surface p-3 shadow-cart-bar">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
          <Download className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-fg">Install Green Basket</p>
          <p className="truncate text-xs text-fg-subtle">
            Add to your home screen — opens like an app.
          </p>
        </div>
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-600"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-fg-subtle transition-colors hover:bg-raised"
        >
          <X className="h-4 w-4" />
        </button>
        </div>
      </div>
    </div>
  );
}
