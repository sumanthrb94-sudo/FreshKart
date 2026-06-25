"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/** Chrome's install event isn't in lib.dom yet — narrow it ourselves. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "freshkart.pwa.dismissed.v1";

/**
 * Registers the service worker and surfaces a Chrome-style "Install app"
 * banner when the browser fires `beforeinstallprompt`. Mounted once in the
 * root layout so it's available on every screen.
 */
export function PwaRegistrar() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW is a progressive enhancement — ignore failures */
      });
    }
  }, []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      try {
        if (window.localStorage.getItem(DISMISS_KEY)) return;
      } catch {
        /* ignore */
      }
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
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-app p-3">
      <div className="animate-rise pointer-events-auto flex items-center gap-3 rounded-2xl border border-brand-500/30 bg-surface p-3 shadow-cart-bar">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
          <Download className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-fg">Install FreshKart</p>
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
  );
}
