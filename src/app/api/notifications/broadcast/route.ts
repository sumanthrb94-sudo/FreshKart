import { NextResponse } from "next/server";
import {
  CredentialsMissingError,
  UnauthorizedError,
  accessToken,
  firestoreUrl,
  requireAdmin,
  serviceAccount,
  type ServiceAccount,
} from "@/lib/server/google-credentials";
import { sendToTokens } from "@/lib/server/fcm";

/**
 * Broadcast a push notification to every buyer's device.
 *
 * This lives on the server for the same reason staff creation does: the power
 * to notify every customer at once is exactly the power the security rules
 * deny a browser. The admin console posts here with its Firebase ID token, the
 * route proves the caller is an admin against the same profile the rules read,
 * and only then does anything get sent.
 *
 * Order-status notifications are a different shape (one buyer, triggered by a
 * status change) and share the sender in `@/lib/server/fcm` rather than this
 * route.
 */

export const runtime = "nodejs";

const MAX_TITLE = 80;
const MAX_BODY = 300;

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

interface RunQueryRow {
  document?: {
    name: string;
    fields?: { fcmTokens?: { arrayValue?: { values?: { stringValue?: string }[] } } };
  };
}

/**
 * Every buyer's device tokens, as a token → owning document map so a token
 * FCM rejects can be traced back and removed.
 */
async function buyerTokens(
  sa: ServiceAccount,
  bearer: string
): Promise<Map<string, string>> {
  const res = await fetch(firestoreUrl(sa, ":runQuery"), {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "users" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "role" },
            op: "EQUAL",
            value: { stringValue: "BUYER" },
          },
        },
        select: { fields: [{ fieldPath: "fcmTokens" }] },
      },
    }),
  });
  if (!res.ok) throw new Error("Could not read the customer list.");

  const rows = (await res.json()) as RunQueryRow[];
  const owners = new Map<string, string>();
  for (const row of rows) {
    const docName = row.document?.name;
    if (!docName) continue;
    for (const entry of row.document?.fields?.fcmTokens?.arrayValue?.values ?? []) {
      if (entry.stringValue) owners.set(entry.stringValue, docName);
    }
  }
  return owners;
}

/**
 * Drop tokens FCM says are dead. Left in place they would be retried on every
 * future broadcast, so this keeps the fan-out from slowly filling with devices
 * that uninstalled months ago.
 */
async function pruneStale(
  sa: ServiceAccount,
  bearer: string,
  owners: Map<string, string>,
  stale: string[]
): Promise<void> {
  const byDoc = new Map<string, Set<string>>();
  for (const token of stale) {
    const docName = owners.get(token);
    if (!docName) continue;
    const set = byDoc.get(docName) ?? new Set<string>();
    set.add(token);
    byDoc.set(docName, set);
  }

  await Promise.all(
    [...byDoc].map(async ([docName, dead]) => {
      const keep = [...owners]
        .filter(([token, owner]) => owner === docName && !dead.has(token))
        .map(([token]) => ({ stringValue: token }));

      // `name` is already an absolute document path.
      await fetch(
        `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=fcmTokens`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { fcmTokens: { arrayValue: { values: keep } } } }),
        }
      ).catch(() => {
        /* Pruning is housekeeping; a failure must not fail the broadcast. */
      });
    })
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      idToken?: string;
      title?: string;
      message?: string;
      link?: string;
    };

    const title = body.title?.trim() ?? "";
    const text = body.message?.trim() ?? "";
    if (!body.idToken) throw new UnauthorizedError("Sign in again to send this.");
    if (!title || !text) {
      return NextResponse.json(
        { error: "A title and a message are both required." },
        { status: 400 }
      );
    }
    if (title.length > MAX_TITLE || text.length > MAX_BODY) {
      return NextResponse.json(
        { error: `Keep the title under ${MAX_TITLE} and the message under ${MAX_BODY} characters.` },
        { status: 400 }
      );
    }
    // Only in-app destinations: an external link in a push is a phishing shape.
    const link = body.link?.trim();
    if (link && !link.startsWith("/")) {
      return NextResponse.json(
        { error: "The link must be an in-app path starting with /." },
        { status: 400 }
      );
    }

    const sa = serviceAccount();
    const bearer = await accessToken(sa);
    await requireAdmin(sa, bearer, body.idToken);

    const owners = await buyerTokens(sa, bearer);
    if (owners.size === 0) {
      return NextResponse.json({ sent: 0, failed: 0, devices: 0 });
    }

    const result = await sendToTokens(sa, [...owners.keys()], {
      title,
      body: text,
      link: link || undefined,
    });

    if (result.staleTokens.length > 0) {
      await pruneStale(sa, bearer, owners, result.staleTokens);
    }

    return NextResponse.json({
      sent: result.sent,
      failed: result.failed,
      devices: owners.size,
      pruned: result.staleTokens.length,
    });
  } catch (error) {
    return fail(error);
  }
}
