import type { DataSource } from "./datasource";
import { MockDataSource } from "./mock";
import { HttpDataSource } from "./http";

/**
 * The single place the app obtains its data source. Set
 * NEXT_PUBLIC_API_BASE_URL (e.g. your GCP Cloud Run URL) to use the real
 * backend; leave it empty to run entirely on the in-browser mock.
 */
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

export const api: DataSource = baseUrl
  ? new HttpDataSource(baseUrl)
  : new MockDataSource();

export const usingMockBackend = !baseUrl;

export { ApiError } from "./datasource";
export type { DataSource } from "./datasource";
