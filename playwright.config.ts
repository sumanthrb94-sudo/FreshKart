import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,     // 5 min per test
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e/report", open: "never" }],
  ],
  use: {
    baseURL: "https://fresh-kart-six.vercel.app",
    headless: false,
    video: "on",
    screenshot: "only-on-failure",
    trace: "on",
    // Use the SYSTEM-INSTALLED Chrome so the window is familiar & front-and-center
    channel: "chrome",
    launchOptions: {
      slowMo: 600,           // slow enough for a human to follow
      args: [
        "--start-maximized",          // fill the screen — impossible to miss
        "--disable-popup-blocking",   // allow Firebase OAuth popup
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled", // bypass google bot detection
      ],
      ignoreDefaultArgs: ["--enable-automation"], // hide automated browser banner
    },
    viewport: null,  // null = use whatever the maximized window gives us
  },
  projects: [
    {
      name: "chrome-desktop",
      use: {},
    },
  ],
  outputDir: "e2e/results",
});
