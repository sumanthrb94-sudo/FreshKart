import { NextResponse } from "next/server";
import {
  CredentialsMissingError,
  UnauthorizedError,
  accessToken,
  firestoreUrl,
  identityToolkitUrl,
  serviceAccount,
  type ServiceAccount,
} from "@/lib/server/google-credentials";
import { sendToTokens } from "@/lib/server/fcm";

/**
 * Push a buyer the news that their order moved on.
 *
 * The buyer's app already raises these alerts itself, but only while it is
 * open — `NotificationProvider` watches Firestore from the buyer's own device,
 * so a phone in a pocket hears nothing. A push has to originate somewhere the
 * buyer isn't, which means here.
 *
 * Called by whoever moved the order: the admin console, or a delivery
 * executive marking a drop done. Both are staff on the web build, so both
 * reach this route; the buyer's own cancel goes through the same client
 * helper and is simply ignored below.
 */

export const runtime = "nodejs";

/** Only transitions worth interrupting someone's day for. */
const MESSAGES: Record<string, { title: string; body: (n: string) => string }> = {
  PACKED: {
    title: "Order packed",
    body: (n) => `${n} is packed and ready for tomorrow morning's delivery.`,
  },
  SHIPPED: {
    title: "Out for delivery",
    body: (n) => `${n} is on its way. It'll reach you before 7 AM.`,
  },
  DELIVERED: {
    title: "Delivered",
    body: (n) => `${n} has been delivered. Enjoy your fresh produce!`,
  },
};

function fail(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof CredentialsMissingError) {
    return NextResponse.json({ error: error.message }, { status: 501 });
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * Like `requireAdmin`, but a delivery executive counts too — they are the ones
 * marking orders delivered. The role is read from the caller's own profile,
 * the same source the security rules use.
 */
async function requireStaff(
  sa: ServiceAccount,
  bearer: string,
  idToken: string
): Promise<string> {
  const lookup = await fetch(identityToolkitUrl(sa, "/accounts:lookup"), {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const found = (await lookup.json()) as { users?: { localId: string }[] };
  const uid = found.users?.[0]?.localId;
  if (!uid) throw new UnauthorizedError("Your session has expired. Sign in again.");

  const res = await fetch(firestoreUrl(sa, `/users/${uid}`), {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  const profile = (await res.json()) as { fields?: { role?: { stringValue?: string } } };
  const role = profile.fields?.role?.stringValue;
  if (role !== "ADMIN" && role !== "DRIVER") {
    throw new UnauthorizedError("Only staff can notify a buyer about an order.");
  }
  return uid;
}

interface OrderDoc {
  fields?: {
    // The buyer field is `buyerId` on Order (src/lib/types.ts) — not `userId`.
    buyerId?: { stringValue?: string };
    orderNumber?: { stringValue?: string };
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      idToken?: string;
      orderId?: string;
      status?: string;
    };

    const template = body.status ? MESSAGES[body.status] : undefined;
    // Statuses nobody needs a push for are a success, not an error — the
    // client fires this on every transition and shouldn't have to know which.
    if (!template) return NextResponse.json({ sent: 0, skipped: true });
    if (!body.idToken || !body.orderId) {
      throw new UnauthorizedError("Sign in again to send this.");
    }

    const sa = serviceAccount();
    const bearer = await accessToken(sa);
    await requireStaff(sa, bearer, body.idToken);

    const orderRes = await fetch(firestoreUrl(sa, `/orders/${body.orderId}`), {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (!orderRes.ok) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    const order = (await orderRes.json()) as OrderDoc;
    const buyerId = order.fields?.buyerId?.stringValue;
    const orderNumber = order.fields?.orderNumber?.stringValue ?? "Your order";
    if (!buyerId) {
      return NextResponse.json(
        { error: "That order has no buyer on it." },
        { status: 422 }
      );
    }

    const buyerRes = await fetch(firestoreUrl(sa, `/users/${buyerId}`), {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const buyer = (await buyerRes.json()) as {
      fields?: { fcmTokens?: { arrayValue?: { values?: { stringValue?: string }[] } } };
    };
    const tokens = (buyer.fields?.fcmTokens?.arrayValue?.values ?? [])
      .map((v) => v.stringValue)
      .filter((v): v is string => !!v);

    if (tokens.length === 0) return NextResponse.json({ sent: 0, devices: 0 });

    const result = await sendToTokens(sa, tokens, {
      title: template.title,
      body: template.body(orderNumber),
      // Matches the mobile build's order route (see @/lib/order-route).
      link: `/orders/detail?id=${encodeURIComponent(body.orderId)}`,
    });

    return NextResponse.json({ sent: result.sent, failed: result.failed, devices: tokens.length });
  } catch (error) {
    return fail(error);
  }
}
