/**
 * Admin-side client for the push broadcast route.
 *
 * Deliberately not part of the `api` backend interface: broadcasting has no
 * mock or direct-to-Firestore equivalent — it only ever works against the
 * server route, which is the only place holding credentials that may notify
 * somebody else's device.
 */
import { getFirebaseAuth } from "../firebase/client";

export interface BroadcastResult {
  /** Devices FCM accepted the message for. */
  sent: number;
  failed: number;
  /** Registered devices at the time of sending. */
  devices: number;
  /** Dead tokens dropped during this send. */
  pruned?: number;
}

export async function sendBroadcast(input: {
  title: string;
  message: string;
  link?: string;
}): Promise<BroadcastResult> {
  const me = getFirebaseAuth().currentUser;
  if (!me) throw new Error("Sign in again to send this.");
  const idToken = await me.getIdToken();

  const res = await fetch("/api/notifications/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, ...input }),
  });

  const json = (await res.json().catch(() => ({}))) as BroadcastResult & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Could not send the notification.");
  return json;
}
