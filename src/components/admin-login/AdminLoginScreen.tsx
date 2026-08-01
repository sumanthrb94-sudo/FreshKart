"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { BrandSplash } from "@/components/ui/BrandSplash";
import { BrandAuthScreen, StaffCredentialFields } from "@/components/ui/BrandAuthScreen";

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
    <BrandAuthScreen
      emblem="🛡️"
      tagline="Operations console"
      subline="Prices · orders · deliveries · reports"
    >
      <form onSubmit={handleSubmit}>
        <h2 className="text-2xl font-extrabold leading-tight text-fg">Admin login</h2>
        <p className="mt-0.5 text-sm text-fg-subtle">Authorised staff only.</p>

        <StaffCredentialFields
          idPrefix="admin"
          username={username}
          password={password}
          usernamePlaceholder="admin"
          showPassword={showPassword}
          onUsername={setUsername}
          onPassword={setPassword}
          onToggleReveal={() => setShowPassword((v) => !v)}
        />

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
    </BrandAuthScreen>
  );
}
