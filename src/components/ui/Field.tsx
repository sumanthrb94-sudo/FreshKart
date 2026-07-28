"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Two input flavors from the brief §4.2:
 *  - "input": white bg, gray-300 border (default, used on auth screens)
 *  - "field": gray-50 bg, gray-200 border (used in checkout & payment)
 */
type Flavor = "input" | "field";

function baseInput(flavor: Flavor) {
  return cn(
    "w-full rounded-lg px-3.5 text-sm text-fg placeholder:text-fg-subtle transition-colors",
    "focus:outline-none disabled:cursor-not-allowed disabled:bg-raised disabled:text-fg-subtle",
    flavor === "input"
      ? "h-11 bg-surface border border-line focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
      : "h-11 bg-raised border border-line focus:bg-surface focus:ring-2 focus:ring-brand-500/30"
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

/** A free-text 10-digit phone field with a fixed "+91" prefix — same visual
 *  treatment as the sign-in OTP phone field, so the country code is always
 *  visible instead of implicit in a bare 10-digit box. Purely a display
 *  affordance: this does NOT check the number against other accounts (see
 *  isPlausibleIndianMobile / phoneIndex for that — reserved for the sign-in
 *  linking step). Pair with sanitizePhoneDigits/isValidPhoneDigits as usual. */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ flavor = "input", className, ...props }, ref) => (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3.5 transition-colors focus-within:ring-2 focus-within:ring-brand-500/30",
        flavor === "input"
          ? "h-11 bg-surface border border-line focus-within:border-brand-500"
          : "h-11 bg-raised border border-line focus-within:bg-surface",
        className
      )}
    >
      <span className="shrink-0 border-r border-line pr-2 text-sm font-semibold text-fg-subtle">
        +91
      </span>
      <input
        ref={ref}
        type="tel"
        inputMode="numeric"
        className="w-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:text-fg-subtle"
        {...props}
      />
    </div>
  )
);
PhoneInput.displayName = "PhoneInput";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  flavor?: Flavor;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ flavor = "input", className, children, ...props }, ref) => (
    <select ref={ref} className={cn(baseInput(flavor), "pr-9", className)} {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";
