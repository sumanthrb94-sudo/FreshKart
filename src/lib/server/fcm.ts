/**
 * Sending push notifications through FCM's HTTP v1 API.
 *
 * This reuses the service-account plumbing the staff route already relies on —
 * `accessToken` mints a `cloud-platform` token, which covers messaging, so no
 * extra credential or the `firebase-admin` package is needed.
 *
 * v1 sends one message per request, so a broadcast is a fan-out. That is fine
 * at this shop's scale (hundreds of buyers, not millions) and it buys
 * something worth having: FCM answers per token, so a device that has
 * uninstalled the app is identifiable and can be pruned instead of being
 * retried forever.
 */
import { accessToken, type ServiceAccount } from "./google-credentials";

/** How many sends are in flight at once — polite to FCM, still quick. */
const CONCURRENCY = 10;

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path to open on tap, e.g. `/orders/detail?id=…`. */
  link?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens FCM reported as dead; the caller should stop storing these. */
  staleTokens: string[];
}

function messagesUrl(sa: ServiceAccount): string {
  return `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
}

/**
 * FCM reports a token that no longer belongs to an install as UNREGISTERED,
 * and a malformed one as INVALID_ARGUMENT. Both mean "never send here again";
 * anything else (a network blip, a quota trip) is worth keeping.
 */
function isDeadToken(status: number, payload: string): boolean {
  if (status === 404) return true;
  return status === 400 && payload.includes("INVALID_ARGUMENT");
}

async function sendOne(
  sa: ServiceAccount,
  token: string,
  message: PushMessage,
  bearer: string
): Promise<{ ok: boolean; dead: boolean }> {
  const res = await fetch(messagesUrl(sa), {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: message.title, body: message.body },
        // Data travels as strings; the tap handler reads `link`.
        data: message.link ? { link: message.link } : undefined,
        android: {
          priority: "HIGH",
          notification: { default_sound: true },
        },
      },
    }),
  });

  if (res.ok) return { ok: true, dead: false };
  const text = await res.text().catch(() => "");
  return { ok: false, dead: isDeadToken(res.status, text) };
}

/**
 * Deliver `message` to every token given, a bounded number at a time.
 * Never rejects — a broadcast that fails for one device still reaches the rest.
 */
export async function sendToTokens(
  sa: ServiceAccount,
  tokens: string[],
  message: PushMessage
): Promise<PushResult> {
  const unique = [...new Set(tokens.filter(Boolean))];
  if (unique.length === 0) return { sent: 0, failed: 0, staleTokens: [] };

  const bearer = await accessToken(sa);
  const result: PushResult = { sent: 0, failed: 0, staleTokens: [] };

  let cursor = 0;
  const worker = async () => {
    while (cursor < unique.length) {
      const token = unique[cursor++];
      try {
        const { ok, dead } = await sendOne(sa, token, message, bearer);
        if (ok) result.sent++;
        else {
          result.failed++;
          if (dead) result.staleTokens.push(token);
        }
      } catch {
        result.failed++;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker)
  );
  return result;
}
