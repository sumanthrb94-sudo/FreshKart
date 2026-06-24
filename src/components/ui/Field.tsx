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
    "w-full rounded-lg px-3.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors",
    "focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500",
    flavor === "input"
      ? "h-11 bg-white border border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      : "h-11 bg-gray-50 border border-gray-200 focus:bg-white focus:ring-2 focus:ring-brand-100"
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
        <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-400">{hint}</p>
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
