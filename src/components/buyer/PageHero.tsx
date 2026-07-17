"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Lighter-weight sibling of ShopHero for list/utility screens — same
 * gradient + orb language, no search bar or drifting produce so it doesn't
 * compete with dense content sitting right below it.
 */
export function PageHero({
  title,
  subtitle,
  backHref,
  backLabel,
  right,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-b-[28px] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-5 pb-7 pt-4 text-white lg:rounded-b-3xl lg:px-8">
      <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -left-10 top-10 h-32 w-32 rounded-full bg-brand-300/20 blur-2xl" />

      {backHref && (
        <Link
          href={backHref}
          className="relative z-10 flex w-fit items-center gap-1 text-xs font-semibold text-white/80 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
        </Link>
      )}

      <div className="relative z-10 mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 max-w-[32ch] text-sm text-white/80">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </div>
  );
}
