import { cn } from "@/lib/utils";

/**
 * Responsive app shell. On mobile it fills the viewport; on desktop it becomes
 * a centered column up to `max-w-app` (1280px) so the site looks like a proper
 * web app rather than a phone emulator. The shell is a full-height flex
 * container: a sticky `header`, a scrollable `main`, and an optional sticky
 * `footer` (the cart bar).
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
    <div className="flex min-h-[100dvh] justify-center bg-canvas">
      <div
        className={cn(
          "relative flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-canvas shadow-2xl md:rounded-xl md:shadow-2xl",
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
