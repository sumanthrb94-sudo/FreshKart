import { defineConfig } from "@playwright/test";

/** Headless run for CI/agent verification — same specs, no window takeover.
 *  The default playwright.config.ts is deliberately headed + slowMo for demos. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3100",
    headless: true,
    viewport: { width: 1280, height: 1600 },
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
  },
  projects: [{ name: "chrome-desktop", use: {} }],
  outputDir: "e2e/results",
});
