import Link from "next/link";
import { Sprout } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

/** Centered column used by the login / register screens. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell contentClassName="bg-white">
      <div className="flex min-h-full flex-col px-6 py-8">
        <Link href="/" className="mb-6 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white">
            <Sprout className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-extrabold text-gray-900">FreshKart</span>
            <span className="block text-2xs font-medium text-gray-400">
              Wholesale B2B · per kg
            </span>
          </span>
        </Link>
        {children}
      </div>
    </AppShell>
  );
}
