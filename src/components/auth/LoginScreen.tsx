"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Zap } from "lucide-react";
import { DEMO_PASSWORD } from "@/lib/mock-data";
import { useAuth } from "@/components/providers/AuthProvider";
import { AuthShell } from "./AuthShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { FullScreenLoader } from "@/components/ui/Spinner";

const DEMO = [
  { label: "Customer", desc: "Kirana buyer — browse & order", email: "customer@freshkart.in" },
  { label: "Admin", desc: "Dashboard, orders & inventory", email: "admin@freshkart.in" },
];

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading, login } = useAuth();
  const callbackUrl = params.get("callbackUrl");
  const justRegistered = params.get("registered") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const destFor = (role: string) =>
    callbackUrl || (role === "ADMIN" ? "/admin" : "/");

  // Already logged in → bounce to home (no back-button loop).
  useEffect(() => {
    if (!loading && user) {
      setRedirecting(true);
      router.replace(destFor(user.role));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  async function doLogin(em: string, pw: string) {
    setSubmitting(true);
    setError(null);
    try {
      const u = await login({ email: em, password: pw });
      setRedirecting(true);
      router.replace(destFor(u.role));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed.");
      setSubmitting(false);
    }
  }

  if (redirecting || (!loading && user)) {
    return (
      <AuthShell>
        <FullScreenLoader label="Loading your shop…" />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-gray-900">Welcome back 👋</h1>
      <p className="mt-1 text-sm text-gray-500">
        Log in to order fresh produce in bulk.
      </p>

      {justRegistered && (
        <Alert variant="success" className="mt-4">
          Account created! Please log in to continue.
        </Alert>
      )}

      {/* Demo one-tap card */}
      <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
          <Zap className="h-3.5 w-3.5" /> Demo — one-tap login
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              disabled={submitting}
              onClick={() => doLogin(d.email, DEMO_PASSWORD)}
              className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-white px-3.5 py-2.5 text-left transition-colors hover:border-brand-300 disabled:opacity-60"
            >
              <span>
                <span className="block text-sm font-bold text-gray-900">{d.label}</span>
                <span className="block text-xs text-gray-500">{d.desc}</span>
              </span>
              <span className="flex items-center gap-1 rounded-full bg-brand-500 px-2.5 py-1 text-xs font-bold text-white">
                Login <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">or enter manually</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          doLogin(email, password);
        }}
      >
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.in"
            required
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={submitting} className="mt-1">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        New to FreshKart?{" "}
        <Link href="/register" className="font-bold text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-gray-400">
        <CheckCircle2 className="h-3.5 w-3.5 text-brand-400" />
        Demo password for both accounts: {DEMO_PASSWORD}
      </p>
    </AuthShell>
  );
}
