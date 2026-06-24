import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
        <Icon className="h-7 w-7 text-brand-500" aria-hidden />
      </div>
      <div>
        <p className="text-base font-bold text-gray-900">{title}</p>
        {subtitle && (
          <p className="mt-1 max-w-xs text-sm text-gray-500">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
