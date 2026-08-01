"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { BrandSplash } from "@/components/ui/BrandSplash";
import { BrandAuthScreen, StaffCredentialFields } from "@/components/ui/BrandAuthScreen";

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
    <BrandAuthScreen
      emblem="🚚"
      tagline="Delivery executive"
      subline="Your route · your stops · your cash"
    >
      <form onSubmit={handleSubmit}>
        <h2 className="text-2xl font-extrabold leading-tight text-fg">Executive login</h2>
        <p className="mt-0.5 text-sm text-fg-subtle">Welcome — sign in and start delivering.</p>

        <StaffCredentialFields
          idPrefix="driver"
          username={username}
          password={password}
          usernamePlaceholder="executive01"
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
          {busy ? "Signing in…" : "Start my run"}
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
