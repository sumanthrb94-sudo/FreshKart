"use client";

import { useLang } from "@/lib/i18n";

export function PromoBanner() {
  const { t } = useLang();
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 px-5 py-4 text-white shadow-[0_10px_24px_-10px_rgba(200,30,44,.6)]">
      {/* soft glow accents for depth */}
      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/15 blur-xl" />
      <div className="pointer-events-none absolute -bottom-10 left-10 h-24 w-24 rounded-full bg-brand-300/30 blur-xl" />
      <p className="relative text-base font-extrabold drop-shadow-sm">{t("promoTitle")} 🥦</p>
      <p className="relative mt-0.5 text-xs font-medium text-white/90">{t("promoSub")}</p>
    </div>
  );
}
