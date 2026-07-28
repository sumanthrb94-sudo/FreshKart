import crypto from "crypto";

/**
 * Server-side Google credentials, used by the routes that must do something
 * the browser is deliberately not allowed to do — today, creating a staff
 * login.
 *
 * This talks to the Identity Toolkit and Firestore REST APIs with a
 * service-account JWT rather than pulling in the Admin SDK: the two calls we
 * need are a dozen lines each, and a server route that never leaves the
 * request path is easier to reason about than an SDK that initialises global
 * app state at import time.
 *
 * The key lives ONLY in the FIREBASE_SERVICE_ACCOUNT_JSON environment
 * variable (the same one the seed scripts already use). It is never imported
 * into client code — anything under /api runs server-side only.
 */

export interface ServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
  token_uri: string;
}

export class CredentialsMissingError extends Error {
  constructor() {
    super(
      "Server credentials aren't configured. Add FIREBASE_SERVICE_ACCOUNT_JSON " +
        "(the whole service-account JSON) to the deployment's environment variables."
    );
    this.name = "CredentialsMissingError";
  }
}

export function serviceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new CredentialsMissingError();
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (!parsed.private_key || !parsed.client_email || !parsed.project_id) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing required fields.");
  }
  return parsed;
}

const base64url = (input: crypto.BinaryLike) =>
  Buffer.from(input as never)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// Tokens last an hour; reuse one across requests rather than paying a
// round-trip per call on a warm instance.
let cached: { token: string; expiresAt: number } | null = null;

export async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: tokenUri,
      exp: now + 3600,
      iat: now,
    })
  );
  const signature = base64url(
    crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(sa.private_key)
  );

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Could not authenticate with Google.");
  cached = { token: json.access_token, expiresAt: now + 3500 };
  return json.access_token;
}

export function identityToolkitUrl(sa: ServiceAccount, path: string): string {
  return `https://identitytoolkit.googleapis.com/v1/projects/${sa.project_id}${path}`;
}

export function firestoreUrl(sa: ServiceAccount, path: string): string {
  return `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents${path}`;
}

/**
 * Verify the caller really is who they claim, and really is an admin.
 *
 * The ID token is checked by Identity Toolkit itself (an expired or forged
 * token simply fails to resolve), and the role is then read from the caller's
 * own Firestore profile — the same source the security rules use, so this
 * route can never be more permissive than the rules are.
 */
export async function requireAdmin(
  sa: ServiceAccount,
  token: string,
  idToken: string
): Promise<{ uid: string; name?: string }> {
  const lookup = await fetch(identityToolkitUrl(sa, "/accounts:lookup"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const found = (await lookup.json()) as { users?: { localId: string; displayName?: string }[] };
  const uid = found.users?.[0]?.localId;
  if (!uid) throw new UnauthorizedError("Your session has expired. Sign in again.");

  const profileRes = await fetch(firestoreUrl(sa, `/users/${uid}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const profile = (await profileRes.json()) as {
    fields?: { role?: { stringValue?: string }; name?: { stringValue?: string } };
  };
  if (profile.fields?.role?.stringValue !== "ADMIN") {
    throw new UnauthorizedError("Only an admin can manage staff accounts.");
  }
  return { uid, name: profile.fields?.name?.stringValue };
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}
