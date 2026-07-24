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
    // Use the environment's pre-installed Chromium when the pinned
    // @playwright/test version's own browser build isn't downloaded.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
    viewport: { width: 1280, height: 1600 },
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
  },
  projects: [{ name: "chrome-desktop", use: {} }],
  outputDir: "e2e/results",
});
