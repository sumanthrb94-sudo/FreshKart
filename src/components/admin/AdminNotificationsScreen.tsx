"use client";

import { useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { sendBroadcast, type BroadcastResult } from "@/lib/api/broadcast";

const MAX_TITLE = 80;
const MAX_BODY = 300;

/**
 * Ready-made announcements for the things a produce shop actually tells its
 * buyers, so the common cases are one click rather than a blank box. "Where it
 * opens" is an in-app path — external links in a push are a phishing shape and
 * the route rejects them.
 */
const TEMPLATES: { label: string; title: string; message: string; link: string }[] = [
  {
    label: "Today's rates are live",
    title: "Today's rates are live",
    message: "Fresh rates just published. Order before tonight's cut-off for tomorrow morning's delivery.",
    link: "/",
  },
  {
    label: "Order cut-off reminder",
    title: "Last call for tomorrow",
    message: "Orders close at 9 PM for delivery before 7 AM tomorrow. Get your list in now.",
    link: "/",
  },
  {
    label: "Offer / coupon",
    title: "A little off today's basket",
    message: "There's a coupon waiting on your next order. Tap to see what's fresh.",
    link: "/",
  },
  {
    label: "Store announcement",
    title: "A note from Green Basket",
    message: "",
    link: "/",
  },
];

export function AdminNotificationsScreen() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("/");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSend = title.trim().length > 0 && message.trim().length > 0 && !sending;

  function applyTemplate(label: string) {
    const template = TEMPLATES.find((t) => t.label === label);
    if (!template) return;
    setTitle(template.title);
    setMessage(template.message);
    setLink(template.link);
    setResult(null);
    setError(null);
  }

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await sendBroadcast({
          title: title.trim(),
          message: message.trim(),
          link: link.trim() || undefined,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the notification.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-brand-600" />
              <h1 className="text-lg font-semibold">Notify buyers</h1>
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              Goes to every buyer who has the app installed and notifications
              switched on. Order updates send themselves — this is for
              everything else.
            </p>
          </CardHeader>

          <CardBody className="flex flex-col gap-4">
            <Field label="Start from" hint="Optional — fills the fields below.">
              <Select
                defaultValue=""
                onChange={(e) => applyTemplate(e.target.value)}
              >
                <option value="">Write my own</option>
                {TEMPLATES.map((t) => (
                  <option key={t.label} value={t.label}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Title"
              htmlFor="push-title"
              hint={`${title.length}/${MAX_TITLE} — this is the bold line on the phone.`}
            >
              <Input
                id="push-title"
                value={title}
                maxLength={MAX_TITLE}
                placeholder="Today's rates are live"
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>

            <Field
              label="Message"
              htmlFor="push-body"
              hint={`${message.length}/${MAX_BODY} — keep it to one glanceable line.`}
            >
              <Textarea
                id="push-body"
                rows={3}
                value={message}
                maxLength={MAX_BODY}
                placeholder="Fresh rates just published. Order before tonight's cut-off."
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>

            <Field
              label="Opens"
              htmlFor="push-link"
              hint="In-app path to open on tap, e.g. / for the shop."
            >
              <Input
                id="push-link"
                value={link}
                placeholder="/"
                onChange={(e) => setLink(e.target.value)}
              />
            </Field>

            {error && <Alert variant="error">{error}</Alert>}

            {result && (
              <Alert variant="success">
                {result.sent === 0
                  ? `No devices received it — ${result.devices} registered, ${result.failed} failed.`
                  : `Sent to ${result.sent} of ${result.devices} device${result.devices === 1 ? "" : "s"}.`}
                {result.failed > 0 && result.sent > 0 && ` ${result.failed} failed.`}
              </Alert>
            )}

            <Button onClick={send} disabled={!canSend} loading={sending} fullWidth>
              <Send className="h-4 w-4" />
              Send to all buyers
            </Button>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
