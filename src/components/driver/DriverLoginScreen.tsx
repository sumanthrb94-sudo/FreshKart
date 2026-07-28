"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Truck } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { BrandSplash } from "@/components/ui/BrandSplash";

/** Usernames are held in Firebase Auth as addresses; the form asks for a
 *  plain username so it never reads like a mailbox. */
const USERNAME_DOMAIN = "@green-basket.in";

/**
 * Delivery executive sign-in, on its own URL and not linked from the buyer
 * app. Same staff credential mechanism as the admin console — drivers work
 * from cheap or shared handsets, so a password beats an OTP that depends on
 * SMS reaching a particular phone.
 */
export function DriverLoginScreen() {
  const router = useRouter();
  const { user, loading: authLoading, login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === "DRIVER") router.replace("/driver");
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
      const email = name.includes("@") ? name : `${name}${USERNAME_DOMAIN}`;
      const signedIn = await login({ email, password });
      if (signedIn.role !== "DRIVER") {
        setError("This is the delivery app. Use the admin console instead.");
        return;
      }
      router.replace("/driver");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || user?.role === "DRIVER") return <BrandSplash />;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-xl"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white">
            <Truck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-fg">Delivery sign-in</h1>
            <p className="text-xs text-fg-subtle">Green Basket executives</p>
          </div>
        </div>

        <label
          htmlFor="driver-username"
          className="mt-6 block text-xs font-semibold uppercase tracking-wide text-fg-subtle"
        >
          Username
        </label>
        <input
          id="driver-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="driver"
          className="mt-1.5 h-12 w-full rounded-xl border border-line bg-transparent px-3.5 text-base font-semibold text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        />

        <label
          htmlFor="driver-password"
          className="mt-4 block text-xs font-semibold uppercase tracking-wide text-fg-subtle"
        >
          Password
        </label>
        <div className="mt-1.5 flex items-center rounded-xl border border-line focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">
          <input
            id="driver-password"
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
          {busy ? "Signing in…" : "Start my run"}
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
