"use client";

import { forwardRef, useLayoutEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toLocalMobile } from "@/lib/format";

/**
 * Two input flavors from the brief §4.2:
 *  - "input": white bg, gray-300 border (default, used on auth screens)
 *  - "field": gray-50 bg, gray-200 border (used in checkout & payment)
 */
type Flavor = "input" | "field";

/**
 * Every text control in checkout, the account screen and the admin console.
 *
 * Two sizing rules, both from real handsets rather than a design file:
 *
 *  - **16px on phones.** Safari zooms the entire page in when you focus a
 *    field whose text is smaller than that, which shoves the field you are
 *    typing into off the side of the screen. It reads as "I can't type in
 *    this box". Desktop has no such behaviour and keeps the denser 14px,
 *    which the admin tables are laid out around.
 *  - **Vertical padding, not a fixed height.** `h-11` with no line box let
 *    glyphs clip against the border — worst on a `select`, whose closed value
 *    Safari lays out with its own metrics. An explicit line box plus padding
 *    cannot clip, whatever the platform does. `lg:leading-6` holds the height
 *    steady across the breakpoint so nothing jumps.
 */
function baseInput(flavor: Flavor) {
  return cn(
    "w-full rounded-lg px-3.5 py-2.5 text-base leading-6 lg:text-sm lg:leading-6",
    "text-fg placeholder:text-fg-subtle transition-colors",
    "focus:outline-none disabled:cursor-not-allowed disabled:bg-raised disabled:text-fg-subtle",
    flavor === "input"
      ? "bg-surface border border-line focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
      : "bg-raised border border-line focus:bg-surface focus:ring-2 focus:ring-brand-500/30"
  );
}

interface FieldWrapperProps {
  label?: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: FieldWrapperProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg-muted">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  flavor?: Flavor;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ flavor = "input", className, ...props }, ref) => (
    <input ref={ref} className={cn(baseInput(flavor), className)} {...props} />
  )
);
Input.displayName = "Input";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  flavor?: Flavor;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ flavor = "input", className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(baseInput(flavor), "h-auto min-h-24 resize-y py-2.5", className)}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  flavor?: Flavor;
}

/**
 * A 10-digit Indian mobile field behind a fixed "+91".
 *
 * The prefix is drawn by the component, so the VALUE must never contain a
 * country code — see `toLocalMobile`. Anything pasted or prefilled with one
 * is reduced here as well as at the source, so a field can never display
 * "+91 | +91…".
 *
 * It also keeps the caret where the typist left it. The field strips
 * non-digits and caps at ten, so the moment what was typed differs from what
 * is stored — a space, a letter, the eleventh digit, backspacing through a
 * pasted "+91" — React rewrites the input's value and the browser drops the
 * caret at the end. Editing the middle of a number became impossible: one
 * keystroke and you were back at the end. The position is recorded in
 * DIGITS-BEFORE-IT rather than characters, since that is the one measure the
 * stripping preserves.
 *
 * `onChange` receives the already-normalised value on `e.target.value`, so
 * call sites can store it directly.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ flavor = "input", className, value, onChange, ...props }, ref) => {
    const innerRef = useRef<HTMLInputElement | null>(null);
    const caretRef = useRef<number | null>(null);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const el = e.currentTarget;
      const raw = el.value;
      const caret = el.selectionStart ?? raw.length;
      const cleaned = toLocalMobile(raw);
      const pos = Math.min(raw.slice(0, caret).replace(/\D/g, "").length, cleaned.length);
      caretRef.current = pos;

      // Hand the parent the normalised value rather than the raw keystrokes.
      el.value = cleaned;
      onChange?.(e);

      // Also restore here, not only in the layout effect below. When the
      // typed character is dropped entirely, the cleaned value EQUALS the
      // current state, so React bails out of re-rendering and the effect
      // never runs — but it still rewrites the input's value to match the
      // prop, parking the caret at the end. This path covers that.
      requestAnimationFrame(() => {
        if (document.activeElement === el) el.setSelectionRange(pos, pos);
      });
    }

    // The ordinary case, before the browser paints, so there is no visible jump.
    useLayoutEffect(() => {
      const el = innerRef.current;
      if (!el || caretRef.current === null) return;
      if (document.activeElement === el) el.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }, [value]);

    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3.5 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-brand-500/30",
          flavor === "input"
            ? "bg-surface border border-line focus-within:border-brand-500"
            : "bg-raised border border-line focus-within:bg-surface",
          className
        )}
      >
        <span className="shrink-0 border-r border-line pr-2 text-base font-semibold leading-6 text-fg-subtle lg:text-sm lg:leading-6">
          +91
        </span>
        <input
          ref={(el) => {
            innerRef.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
          }}
          type="tel"
          inputMode="numeric"
          value={toLocalMobile(String(value ?? ""))}
          onChange={handleChange}
          className="w-full min-w-0 flex-1 bg-transparent text-base leading-6 text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:text-fg-subtle lg:text-sm lg:leading-6"
          {...props}
        />
      </div>
    );
  }
);
PhoneInput.displayName = "PhoneInput";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  flavor?: Flavor;
}

/** Native select — iOS gives it a full-height wheel picker no custom dropdown
 *  matches on a phone. Only the chrome is replaced: the browser's own arrow
 *  sat cramped against the border and varied per platform. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ flavor = "input", className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(baseInput(flavor), "appearance-none pr-10", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
      />
    </div>
  )
);
Select.displayName = "Select";
