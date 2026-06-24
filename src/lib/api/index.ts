import type { DataSource } from "./datasource";
import { MockDataSource } from "./mock";
import { HttpDataSource } from "./http";
import { FirebaseDataSource } from "./firebase";
import { firebaseConfigured } from "@/lib/firebase/client";

/**
 * The single place the app obtains its data source. Selection priority:
 *   1. Firebase  — when NEXT_PUBLIC_FIREBASE_* config is present (the chosen
 *      production backend: Firestore + Auth + Storage, accessed directly).
 *   2. HTTP      — when NEXT_PUBLIC_API_BASE_URL points at a REST backend.
 *   3. Mock      — in-browser default for local dev (no config needed).
 */
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

export type BackendKind = "firebase" | "http" | "mock";

export const backendKind: BackendKind = firebaseConfigured
  ? "firebase"
  : baseUrl
    ? "http"
    : "mock";

export const api: DataSource = firebaseConfigured
  ? new FirebaseDataSource()
  : baseUrl
    ? new HttpDataSource(baseUrl)
    : new MockDataSource();

export const usingMockBackend = backendKind === "mock";

export { ApiError } from "./datasource";
export type { DataSource } from "./datasource";
