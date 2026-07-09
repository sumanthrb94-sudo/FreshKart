import { cn } from "@/lib/utils";

/**
 * Responsive app shell. On mobile it is a centered `max-w-app` column with a
 * sticky header, scrollable main, and optional sticky footer. At the `lg`
 * breakpoint the shell becomes a full-width, full-height row: a persistent
 * left sidebar and a scrollable main content area that fills the remaining
 * viewport width.
 */
export function AppShell({
  header,
  footer,
  sidebar,
  children,
  className,
  contentClassName,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className="flex min-h-[100dvh] justify-center bg-canvas lg:justify-start">
      <div
        className={cn(
          "relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-canvas shadow-2xl md:rounded-xl md:shadow-2xl",
          "lg:max-w-none lg:flex-row lg:rounded-none lg:shadow-none",
          className
        )}
      >
        {sidebar && (
          <aside className="hidden shrink-0 lg:flex lg:w-[var(--sidebar-width)] lg:flex-col">
            {sidebar}
          </aside>
        )}
        {header && <div className="shrink-0 lg:hidden">{header}</div>}
        <main
          className={cn(
            "fc-scroll relative flex-1 overflow-y-auto",
            contentClassName
          )}
        >
          {children}
        </main>
        {footer && <div className="shrink-0 lg:hidden">{footer}</div>}
      </div>
    </div>
  );
}
