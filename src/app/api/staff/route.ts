import { NextResponse } from "next/server";
import {
  CredentialsMissingError,
  UnauthorizedError,
  accessToken,
  firestoreUrl,
  identityToolkitUrl,
  requireAdmin,
  serviceAccount,
} from "@/lib/server/google-credentials";

/**
 * Staff accounts — creating and deactivating delivery executives.
 *
 * This has to live on the server: creating another person's login is exactly
 * the power the security rules deny the browser (a client may only ever write
 * its OWN user document, and only as a BUYER). So the admin console posts
 * here with its Firebase ID token, the route proves the caller is an admin
 * against the same profile the rules read, and only then creates the account.
 *
 * Deactivation matters as much as creation: an executive carries cash and the
 * authority to write off produce, so when they leave, access has to stop the
 * same hour — not whenever someone remembers to ask for a key.
 */

export const runtime = "nodejs";

/** Logins are stored as addresses; the driver only ever types the username. */
const USERNAME_DOMAIN = "@green-basket.in";

function isValidUsername(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(name);
}

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

/** Create a delivery executive: Auth login + the profile that carries the role. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      idToken?: string;
      username?: string;
      name?: string;
      phone?: string;
      password?: string;
    };
    const username = (body.username ?? "").trim().toLowerCase();
    const name = (body.name ?? "").trim();
    const phone = (body.phone ?? "").trim();
    const password = body.password ?? "";

    if (!body.idToken) throw new UnauthorizedError("Sign in again.");
    if (!isValidUsername(username)) {
      return NextResponse.json(
        {
          error:
            "Username must be 3–30 characters: lowercase letters, numbers, dot, dash or underscore.",
        },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ error: "Enter the executive's name." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const sa = serviceAccount();
    const token = await accessToken(sa);
    await requireAdmin(sa, token, body.idToken);

    const email = `${username}${USERNAME_DOMAIN}`;
    const created = await fetch(identityToolkitUrl(sa, "/accounts"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: name, emailVerified: true }),
    });
    const createdJson = (await created.json()) as {
      localId?: string;
      error?: { message?: string };
    };

    if (!createdJson.localId) {
      const code = createdJson.error?.message ?? "";
      if (code.includes("EMAIL_EXISTS")) {
        return NextResponse.json(
          { error: `The username "${username}" is already taken.` },
          { status: 409 }
        );
      }
      if (code.includes("WEAK_PASSWORD")) {
        return NextResponse.json({ error: "That password is too weak." }, { status: 400 });
      }
      return NextResponse.json({ error: code || "Could not create the login." }, { status: 502 });
    }

    const uid = createdJson.localId;
    const createdAt = new Date().toISOString();
    const profile = {
      fields: {
        name: { stringValue: name },
        email: { stringValue: email },
        phone: { stringValue: phone },
        role: { stringValue: "DRIVER" },
        businessName: { stringValue: "Green Basket Delivery" },
        createdAt: { stringValue: createdAt },
      },
    };
    const wrote = await fetch(firestoreUrl(sa, `/users/${uid}`), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });

    if (!wrote.ok) {
      // A login with no profile can sign in but has no role, which reads as
      // "This account doesn't have staff access" and is confusing to debug
      // later. Roll the half-made account back rather than leave it behind.
      await fetch(identityToolkitUrl(sa, "/accounts:delete"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ localId: uid }),
      }).catch(() => {});
      return NextResponse.json(
        { error: "Created the login but couldn't save the profile — nothing was kept." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      user: { id: uid, name, email, phone, role: "DRIVER", createdAt },
      username,
    });
  } catch (error) {
    return fail(error);
  }
}

/** Turn an executive's access on or off without deleting their history. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      idToken?: string;
      driverId?: string;
      active?: boolean;
    };
    if (!body.idToken) throw new UnauthorizedError("Sign in again.");
    if (!body.driverId) {
      return NextResponse.json({ error: "Missing the executive to update." }, { status: 400 });
    }

    const sa = serviceAccount();
    const token = await accessToken(sa);
    await requireAdmin(sa, token, body.idToken);

    const disabled = body.active === false;
    const updated = await fetch(identityToolkitUrl(sa, "/accounts:update"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ localId: body.driverId, disableUser: disabled }),
    });
    if (!updated.ok) {
      return NextResponse.json({ error: "Could not change that account." }, { status: 502 });
    }

    // Mirror it onto the profile so the admin list can show the state without
    // a second round-trip to Identity Toolkit for every row.
    await fetch(
      firestoreUrl(sa, `/users/${body.driverId}`) + "?updateMask.fieldPaths=disabled",
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { disabled: { booleanValue: disabled } } }),
      }
    );

    return NextResponse.json({ id: body.driverId, active: !disabled });
  } catch (error) {
    return fail(error);
  }
}
