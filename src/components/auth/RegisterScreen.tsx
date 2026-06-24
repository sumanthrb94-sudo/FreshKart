"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { AuthShell } from "./AuthShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { FullScreenLoader } from "@/components/ui/Spinner";

export function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [form, setForm] = useState({
    name: "",
    businessName: "",
    email: "",
    phone: "",
    city: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await register(form);
      setRedirecting(true);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account.");
      setSubmitting(false);
    }
  }

  if (redirecting) {
    return (
      <AuthShell>
        <FullScreenLoader label="Setting up your shop…" />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
      <p className="mt-1 text-sm text-gray-500">
        Start ordering fresh produce in bulk for your business.
      </p>

      {error && <Alert variant="error" className="mt-4">{error}</Alert>}

      <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Suresh Kumar" required />
          </Field>
          <Field label="Business name">
            <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="Suresh Kirana Store" required />
          </Field>
        </div>
        <Field label="Email">
          <Input type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@business.in" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="9812345678" required />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Bengaluru" required />
          </Field>
        </div>
        <Field label="Password" hint="At least 6 characters">
          <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" required />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={submitting} className="mt-1">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-brand-600 hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
