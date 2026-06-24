import { NextResponse } from "next/server";
import { RepoError } from "./repository";

/** Wrap a handler so RepoError → JSON error with the right status. */
export async function handle<T>(fn: () => T | Promise<T>): Promise<NextResponse> {
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
