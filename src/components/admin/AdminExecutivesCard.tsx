"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Power, UserPlus } from "lucide-react";
import type { User } from "@/lib/types";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

/** Readable but not guessable: no ambiguous characters, so it survives being
 *  read aloud down a phone line to someone standing at a van. */
function suggestPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("") + "@1";
}

/**
 * Onboarding a delivery executive.
 *
 * Creating someone else's login is the one thing the browser is not allowed
 * to do — the security rules let a client write only its own profile, and
 * only as a buyer — so this posts to /api/staff, which holds the
 * service-account key. That indirection is the whole reason this card can
 * exist at all instead of someone opening the Firebase console.
 */
export function AdminExecutivesCard() {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const { data: drivers, loading } = useAsync(
    () => (api.listDrivers ? api.listDrivers() : Promise.resolve([] as User[])),
    [tick]
  );

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState(suggestPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    if (!api.createDriverAccount) return;
    setBusy(true);
    setError(null);
    try {
      await api.createDriverAccount({ name, username, phone, password });
      // Shown once, on purpose: the password is hashed the moment it lands in
      // Firebase and can never be read back — only reset.
      setCreated({ username, password });
      setName("");
      setUsername("");
      setPhone("");
      setPassword(suggestPassword());
      setAdding(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the executive.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(driver: User) {
    if (!api.setDriverActive) return;
    setBusy(true);
    setError(null);
    try {
      await api.setDriverActive(driver.id, driver.disabled === true);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change that account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-fg-subtle" aria-hidden />
        <h2 className="text-sm font-bold text-fg">Delivery executives</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {created && (
          <Alert variant="success">
            <span className="block font-bold">{created.username} is ready to sign in.</span>
            <span className="mt-1 block text-xs">
              Password: <span className="font-mono font-bold">{created.password}</span> — write it
              down now, it can&apos;t be shown again.
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(`Username: ${created.username}\nPassword: ${created.password}`)
                  .then(() => setCopied(true))
                  .catch(() => {});
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-fg"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy both"}
            </button>
          </Alert>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (drivers ?? []).length === 0 ? (
          <p className="text-xs text-fg-subtle">
            No executives yet. Add one and they sign in at <code>/driver-login</code>.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {(drivers ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">
                    {d.name}
                    {d.disabled && (
                      <span className="ml-2 rounded-full bg-red-500/15 px-1.5 py-0.5 text-2xs font-bold text-red-500">
                        access off
                      </span>
                    )}
                  </p>
                  <p className="truncate text-2xs text-fg-subtle">
                    {(d.email ?? "").replace("@green-basket.in", "")}
                    {d.phone ? ` · ${d.phone}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => toggleActive(d)}
                  leadingIcon={<Power className="h-4 w-4" />}
                >
                  {d.disabled ? "Restore" : "Revoke"}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {adding ? (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-raised p-3">
            <Field label="Name" id="exec-name" value={name} onChange={setName} placeholder="Ravi Kumar" />
            <Field
              label="Username"
              id="exec-username"
              value={username}
              onChange={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
              placeholder="executive02"
            />
            <Field
              label="Mobile"
              id="exec-phone"
              value={phone}
              onChange={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
              placeholder="9700000002"
            />
            <Field
              label="Password"
              id="exec-password"
              value={password}
              onChange={setPassword}
              placeholder=""
            />
            <p className="text-2xs text-fg-subtle">
              They sign in with the username only — the app adds the rest.
            </p>
            <div className="flex gap-2">
              <Button loading={busy} disabled={!name.trim() || username.length < 3} onClick={create}>
                Create executive
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setCreated(null);
              setCopied(false);
              setAdding(true);
            }}
            leadingIcon={<UserPlus className="h-4 w-4" />}
          >
            Add an executive
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-2xs font-bold uppercase tracking-wide text-fg-subtle">{label}</span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          "h-10 rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-brand-500",
          className
        )}
      />
    </label>
  );
}
