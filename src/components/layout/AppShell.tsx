import { cn } from "@/lib/utils";

/**
 * The centered mobile column (max 480px) from brief §3.7. On desktop it sits
 * on a gray-100 backdrop with a soft shadow. The column is a full-height flex
 * container: a sticky `header`, a scrollable `main`, and an optional sticky
 * `footer` (the cart bar). Overlays/sheets render as `children` and dim the
 * whole viewport while constraining their content to the column width.
 */
export function AppShell({
  header,
  footer,
  children,
  className,
  contentClassName,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className="flex min-h-[100dvh] justify-center bg-black">
      <div
        className={cn(
          "relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-canvas shadow-xl",
          className
        )}
      >
        {header}
        <main className={cn("fc-scroll relative flex-1 overflow-y-auto", contentClassName)}>
          {children}
        </main>
        {footer}
      </div>
    </div>
  );
}
