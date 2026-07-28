"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { BrandSplash } from "@/components/ui/BrandSplash";

/** Usernames are stored in Firebase Auth as email addresses, so the plain
 *  username typed here is expanded to one. Keeping the form a "username"
 *  field avoids implying this is a mailbox anyone should write to. */
const USERNAME_DOMAIN = "@green-basket.in";

/**
 * Admin-only sign-in, on its own URL and deliberately not linked from
 * anywhere in the buyer app. Uses a username + password credential held in
 * Firebase Auth — deliberately separate from the buyer flow, which is phone
 * OTP only. The password is never stored in this repo; the account is
 * provisioned directly in Firebase, and `api.login` rejects (and signs out)
 * any account lacking the ADMIN role.
 */
export function AdminLoginScreen() {
  const router = useRouter();
  const { user, loading: authLoading, login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in as an admin (e.g. opening the bookmarked link on a
  // device with a live session) — go straight through rather than asking for
  // credentials we've already verified.
  useEffect(() => {
    if (user?.role === "ADMIN") router.replace("/admin");
  }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Allow either a bare username ("admin") or the full address.
      const email = name.includes("@") ? name : `${name}${USERNAME_DOMAIN}`;
      const signedIn = await login({ email, password });
      router.replace(signedIn.role === "ADMIN" ? "/admin" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  // Hold the form back until auth has settled, and while the redirect above
  // is in flight — otherwise an admin opening their bookmarked link sees the
  // sign-in card flash before being let through, which reads as "it logged
  // me out again".
  if (authLoading || user?.role === "ADMIN") return <BrandSplash />;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-xl"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-fg">Admin sign-in</h1>
            <p className="text-xs text-fg-subtle">Authorized staff only</p>
          </div>
        </div>

        <label
          htmlFor="admin-username"
          className="mt-6 block text-xs font-semibold uppercase tracking-wide text-fg-subtle"
        >
          Username
        </label>
        <input
          id="admin-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="admin"
          className="mt-1.5 h-12 w-full rounded-xl border border-line bg-transparent px-3.5 text-base font-semibold text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        />

        <label
          htmlFor="admin-password"
          className="mt-4 block text-xs font-semibold uppercase tracking-wide text-fg-subtle"
        >
          Password
        </label>
        <div className="mt-1.5 flex items-center rounded-xl border border-line focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">
          <input
            id="admin-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            // Revealing the password makes this a text field, and an Android
            // keyboard will then capitalise and autocorrect it — silently
            // turning a correct password into a wrong one.
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="••••••••"
            className="h-12 flex-1 bg-transparent px-3.5 text-base font-semibold text-fg outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="px-3 text-fg-subtle transition-colors hover:text-fg"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Signing in…" : "Sign in"}
        </button>

        {error && (
          <Alert variant="error" className="mt-4">
            {error}
          </Alert>
        )}
      </form>
    </div>
  );
}
