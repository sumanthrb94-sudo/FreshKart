import { NextResponse } from "next/server";
import { RepoError } from "./repository";

/** Wrap a handler so RepoError → JSON error with the right status. */
export async function handle<T>(fn: () => T | Promise<T>): Promise<NextResponse> {
  // The in-memory reference backend models NO authentication (see repository.ts)
  // — every route it serves is an unauthenticated read/write of customer PII,
  // orders and prices. The production app talks to Firebase directly, so these
  // are dead weight there. Two locks, not one:
  //   1. It never runs in a production build — even ENABLE_REFERENCE_API=true
  //      can't open it — so a stray env var on a prod deploy can't turn the
  //      whole unauthenticated surface on.
  //   2. Off by default everywhere else; opt in with ENABLE_REFERENCE_API=true
  //      for local/dev against the in-memory backend.
  // /api/health stays up — it doesn't go through handle().
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_REFERENCE_API !== "true") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  try {
    const data = await fn();
    return NextResponse.json(data ?? null);
  } catch (e) {
    if (e instanceof RepoError) {
      return NextResponse.json({ message: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ message }, { status: 500 });
  }
}

// The reference backend keeps mutable state in memory; never cache it.
export const dynamic = "force-dynamic";
