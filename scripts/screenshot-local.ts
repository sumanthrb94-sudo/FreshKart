import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const outDir = path.join("e2e", "screenshots", "local-smoke");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, "login-desktop.png") });
  console.log("saved login-desktop.png");

  // Click demo buyer
  const demoBuyer = page.getByRole("button", { name: /Demo: Buyer/i });
  if (await demoBuyer.isVisible().catch(() => false)) {
    await demoBuyer.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(outDir, "buyer-home-desktop.png") });
    console.log("saved buyer-home-desktop.png");
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
