import type { DataSource } from "./datasource";
import { MockDataSource } from "./mock";

/**
 * QA MODE: Force mock backend for testing.
 * This bypasses Firebase and uses in-memory mock data.
 */
export type BackendKind = "mock";

export const backendKind: BackendKind = "mock";

export const api: DataSource = new MockDataSource();

export const usingMockBackend = true;

export { ApiError } from "./datasource";
export type { DataSource } from "./datasource";
