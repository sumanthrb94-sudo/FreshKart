"use client";

import { Eye, EyeOff, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

/**
 * The sign-in screen: an animated produce hero over a card that takes the
 * credential.
 *
 * The buyer's landing page had this look and the two staff screens — admin
 * and delivery executive — did not: they were a plain box on a flat canvas,
 * which made them feel like a different, older product. They are the same
 * business, so they are now the same screen, and this component is the single
 * copy of it. Anything that changes here changes for all three, which is the
 * point: three hand-maintained copies of an animation drift within a month.
 *
 * Only the wording and the card contents differ per screen.
 */

/** Fruit and veg ricocheting behind the wordmark, off every edge, forever. */
const FLOATERS = [
  { e: "🍅", s: "text-3xl", dx: "8s", dy: "6s", ox: "0s", oy: "-2s" },
  { e: "🥦", s: "text-2xl", dx: "7s", dy: "9s", ox: "-3s", oy: "-1s" },
  { e: "🍇", s: "text-xl", dx: "9s", dy: "7s", ox: "-5s", oy: "-4s" },
  { e: "🍋", s: "text-2xl", dx: "6.5s", dy: "8.5s", ox: "-2.5s", oy: "-6s" },
  { e: "🍆", s: "text-2xl", dx: "8.5s", dy: "6.5s", ox: "-7s", oy: "-3s" },
  { e: "🫑", s: "text-2xl", dx: "7.5s", dy: "9.5s", ox: "-1s", oy: "-5s" },
  { e: "🧅", s: "text-2xl", dx: "9.5s", dy: "7.5s", ox: "-4s", oy: "-8s" },
  { e: "🥔", s: "text-xl", dx: "6s", dy: "8s", ox: "-6s", oy: "-2.5s" },
  { e: "🥕", s: "text-2xl", dx: "8s", dy: "7.5s", ox: "-3.5s", oy: "-7s" },
];

export function BrandAuthScreen({
  emblem = "🛒",
  title = "Green Basket",
  tagline,
  subline,
  children,
}: {
  /** The bobbing hero mark. A cart for buyers, a van for the executives. */
  emblem?: string;
  title?: string;
  tagline?: string;
  subline?: string;
  /** The card at the foot of the screen: whatever this screen signs in with. */
  children: React.ReactNode;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-[100dvh] justify-center bg-canvas lg:items-center lg:p-6">
      <div className="relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-gradient-to-b from-brand-500 via-brand-600 to-brand-700 shadow-xl lg:h-auto lg:max-h-[90vh] lg:max-w-2xl lg:rounded-3xl">
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -left-12 top-28 h-44 w-44 rounded-full bg-brand-300/20 blur-2xl" />

        {/* Theme toggle — top right corner */}
        <button
          type="button"
          onClick={toggleTheme}
          className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/55"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-7 text-center text-white">
          {FLOATERS.map((f, i) => (
            <span
              key={i}
              className={cn(
                "pointer-events-none absolute opacity-80 drop-shadow motion-reduce:hidden",
                f.s
              )}
              style={{
                animationName: "driftX, driftY",
                animationDuration: `${f.dx}, ${f.dy}`,
                animationTimingFunction: "linear",
                animationIterationCount: "infinite",
                animationDirection: "alternate",
                animationDelay: `${f.ox}, ${f.oy}`,
                zIndex: 0,
              }}
            >
              {f.e}
            </span>
          ))}

          <span className="relative z-10 mb-2 animate-float-slow text-7xl drop-shadow-lg motion-reduce:animate-none">
            {emblem}
          </span>

          <h1 className="relative z-10 text-5xl font-extrabold tracking-tight drop-shadow-sm">
            {title}
          </h1>
          {tagline && (
            <p className="relative z-10 mt-2 text-sm font-semibold text-white/90">{tagline}</p>
          )}
          {subline && <p className="relative z-10 mt-1 text-xs text-white/70">{subline}</p>}
        </div>

        {/* Auth card */}
        <div className="relative z-10 rounded-t-[28px] bg-surface px-7 pb-9 pt-3 shadow-[0_-12px_40px_-12px_rgba(0,0,0,.3)]">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The username + password pair both staff screens ask for.
 *
 * Shared because of a bug that had to be fixed twice: revealing a password
 * turns the field into type="text", and an Android keyboard then capitalises
 * and autocorrects it — silently turning a correct password into a wrong one
 * while the user stares at what looks right.
 */
export function StaffCredentialFields({
  idPrefix,
  username,
  password,
  usernamePlaceholder,
  showPassword,
  onUsername,
  onPassword,
  onToggleReveal,
}: {
  idPrefix: string;
  username: string;
  password: string;
  usernamePlaceholder: string;
  showPassword: boolean;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  onToggleReveal: () => void;
}) {
  return (
    <>
      <label
        htmlFor={`${idPrefix}-username`}
        className="mt-4 block text-xs font-semibold uppercase tracking-wide text-fg-subtle"
      >
        Username
      </label>
      <input
        id={`${idPrefix}-username`}
        value={username}
        onChange={(e) => onUsername(e.target.value)}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={usernamePlaceholder}
        className="mt-1.5 h-12 w-full rounded-xl border border-line bg-transparent px-3.5 text-base font-semibold text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
      />

      <label
        htmlFor={`${idPrefix}-password`}
        className="mt-4 block text-xs font-semibold uppercase tracking-wide text-fg-subtle"
      >
        Password
      </label>
      <div className="mt-1.5 flex items-center rounded-xl border border-line focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">
        <input
          id={`${idPrefix}-password`}
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="••••••••"
          className="h-12 flex-1 bg-transparent px-3.5 text-base font-semibold text-fg outline-none"
        />
        <button
          type="button"
          onClick={onToggleReveal}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="px-3 text-fg-subtle transition-colors hover:text-fg"
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </>
  );
}
