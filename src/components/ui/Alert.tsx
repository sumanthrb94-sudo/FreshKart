import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Alert({
  variant,
  children,
  className,
}: {
  variant: "success" | "error";
  children: React.ReactNode;
  className?: string;
}) {
  const success = variant === "success";
  const Icon = success ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={success ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm",
        success
          ? "border-brand-500/30 bg-brand-500/15 text-brand-300"
          : "border-red-500/30 bg-red-500/15 text-red-300",
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
