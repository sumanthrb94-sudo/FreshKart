"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LogIn,
  LogOut,
  Package,
  Sprout,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";

function IconButton({
  label,
  href,
  onClick,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls =
    "flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25";
  if (href)
    return (
      <Link href={href} aria-label={label} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function BuyerHeader() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    // Full navigation so the back button can't return to a protected page.
    window.location.assign("/login");
  }

  return (
    <header className="sticky top-0 z-30 shrink-0 bg-brand-500 text-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
            <Sprout className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-extrabold">FreshKart</span>
            <span className="block text-2xs font-medium text-white/80">
              Wholesale B2B · per kg
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-1.5">
          {isAuthenticated ? (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="mr-0.5 flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/25"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Admin
                </Link>
              )}
              <IconButton label="Your orders" href="/orders">
                <Package className="h-4 w-4" />
              </IconButton>
              <IconButton label="Your account" href="/account">
                <UserIcon className="h-4 w-4" />
              </IconButton>
              <IconButton label="Log out" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </IconButton>
            </>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-50"
            >
              <LogIn className="h-3.5 w-3.5" />
              Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
