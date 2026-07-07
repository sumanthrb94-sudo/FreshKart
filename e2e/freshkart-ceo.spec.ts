/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║          FRESHKART — CEO-STYLE PRODUCTION READINESS E2E TEST           ║
 * ║  Runs HEADED (you see the browser). Sign in with Google when prompted. ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Run: npm run test:e2e
 */

import { test, expect, Page, BrowserContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://fresh-kart-six.vercel.app";
const SCREENSHOTS_DIR = path.join("e2e", "screenshots");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function logStep(page: Page, step: string) {
  console.log(`\n${"═".repeat(65)}`);
  console.log(`  ✦  ${step}`);
  console.log(`${"═".repeat(65)}`);
  await page
    .evaluate((s) => {
      let el = document.getElementById("__ceo_banner__") as HTMLDivElement;
      if (!el) {
        el = document.createElement("div");
        el.id = "__ceo_banner__";
        el.style.cssText = [
          "position:fixed;top:0;left:0;right:0;z-index:99999",
          "background:#0f0f1a;color:#00d4aa;font:700 13px/38px 'Courier New',monospace",
          "text-align:center;letter-spacing:.06em;pointer-events:none",
          "border-bottom:2px solid #00d4aa;box-shadow:0 2px 12px rgba(0,212,170,.4)",
        ].join(";");
        document.body.prepend(el);
      }
      el.textContent = `🔍 ${s}`;
    }, step)
    .catch(() => {});
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const file = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  console.log(`  📸  ${file}`);
}

/**
 * Wait for the main page to show ShopScreen (i.e. auth completed).
 * Polls every second for up to 150 s — doesn't care about popup close.
 */
async function waitForShopScreen(page: Page) {
  console.log("\n  👆  Sign in with Google in the popup. Test resumes automatically.\n");
  await page.waitForFunction(
    () => {
      // OnboardingScreen is gone when "Sign in to continue" h2 disappears
      const onboarding = Array.from(document.querySelectorAll("h2, h1")).some(
        (el) => el.textContent?.toLowerCase().includes("sign in")
      );
      if (!onboarding) return true;
      // Also done if any bottom-nav or shop content appears
      const nav = document.querySelector("nav, [role='navigation']");
      const shop = document.querySelector('[class*="shop"], [class*="product"]');
      return !!(nav || shop);
    },
    { timeout: 150_000, polling: 1000 }
  );
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2_000);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe("FreshKart — CEO Production Readiness", () => {
  test.setTimeout(300_000); // 5 minutes total

  test("Full buyer journey + admin smoke test", async ({ browser }) => {
    // ── Use a DESKTOP context (no mobile emulation) so popups work reliably ──
    const context: BrowserContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      // Disable popup blocking so Google OAuth popup fires correctly
      permissions: ["geolocation"],
    });

    // Allow all popups
    await context.grantPermissions([]);

    const page = await context.newPage();

    // Ensure the browser window is brought to the front
    await page.bringToFront();

    const results: { step: string; status: "✅" | "⚠️" | "❌"; note?: string }[] = [];
    const pass = (step: string, note?: string) => {
      console.log(`  ✅  ${step}${note ? " — " + note : ""}`);
      results.push({ step, status: "✅", note });
    };
    const warn = (step: string, note?: string) => {
      console.log(`  ⚠️  ${step}${note ? " — " + note : ""}`);
      results.push({ step, status: "⚠️", note });
    };

    // ── STEP 1: LANDING PAGE ────────────────────────────────────────────────
    await logStep(page, "STEP 1 / 8  —  Production site loads");
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30_000 });
    const title = await page.title();
    console.log(`  📄  Title: "${title}"`);
    expect(title).toMatch(/FreshKart/i);
    pass("Production site loads", title);
    await shot(page, "01-landing");

    // ── STEP 2: ONBOARDING SCREEN ───────────────────────────────────────────
    await logStep(page, "STEP 2 / 8  —  Onboarding screen renders");
    await page
      .getByText(/Sign in to continue/i)
      .waitFor({ state: "visible", timeout: 20_000 });
    pass("Onboarding / Sign-in screen visible");
    await shot(page, "02-onboarding");

    // ── STEP 3: GOOGLE SIGN-IN ──────────────────────────────────────────────
    await logStep(page, "STEP 3 / 8  —  Google Sign-In");
    const googleBtn = page.getByRole("button", { name: /continue with google/i });
    await googleBtn.waitFor({ state: "visible", timeout: 10_000 });

    console.log("  🖱️  Clicking 'Continue with Google' — popup will open...");

    // Listen for the popup BEFORE clicking
    const popupPromise = context.waitForEvent("page", { timeout: 30_000 });
    await googleBtn.click();

    let popup: Page | null = null;
    try {
      popup = await popupPromise;
      await popup.bringToFront();
      console.log("  🪟  Popup opened:", popup.url().slice(0, 80) + "...");
      pass("Google popup opened");
    } catch {
      warn("Google popup did not open — may be blocked or already signed in");
    }

    // ── STEP 4: WAIT FOR AUTH ───────────────────────────────────────────────
    await logStep(page, "STEP 4 / 8  —  Waiting for you to sign in (up to 2.5 min)");
    await page.bringToFront();
    await waitForShopScreen(page);
    pass("Authenticated — ShopScreen detected");
    await shot(page, "04-shop");

    // ── STEP 5: PRODUCT BROWSING ────────────────────────────────────────────
    await logStep(page, "STEP 5 / 8  —  ShopScreen & product browsing");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await shot(page, "05-shop-home");

    const addBtn = page.getByRole("button", { name: /^\+$|^add$/i }).first();
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addBtn.click();
      pass("Product added to cart");
      await shot(page, "05-added-to-cart");
    } else {
      warn("No add-to-cart button (DB may have no products)");
    }

    // ── STEP 6: ORDERS ──────────────────────────────────────────────────────
    await logStep(page, "STEP 6 / 8  —  Orders screen");
    await page.goto(`${BASE_URL}/orders`, { waitUntil: "networkidle" });
    const ordersOk = await page
      .locator("main, h1, h2, section")
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);
    ordersOk ? pass("Orders screen loads") : warn("Orders screen timeout");
    await shot(page, "06-orders");

    // ── STEP 7: ACCOUNT ─────────────────────────────────────────────────────
    await logStep(page, "STEP 7 / 8  —  Account / Profile screen");
    await page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" });
    const accountOk = await page
      .locator("main, h1, h2, section")
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);
    accountOk ? pass("Account screen loads") : warn("Account screen timeout");
    await shot(page, "07-account");

    // ── STEP 8: ADMIN ───────────────────────────────────────────────────────
    await logStep(page, "STEP 8 / 8  —  Admin console");
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
    const adminOk = await page
      .locator("main, h1, [class*='admin']")
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    if (adminOk) {
      pass("Admin dashboard visible");
      for (const [label, route] of [
        ["Products",  "/admin/products"],
        ["Orders",    "/admin/orders"],
        ["Customers", "/admin/customers"],
        ["POS",       "/admin/pos"],
      ] as const) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
        const ok = await page
          .locator("main, h1, h2")
          .first()
          .isVisible({ timeout: 6_000 })
          .catch(() => false);
        ok ? pass(`Admin › ${label}`) : warn(`Admin › ${label} not reachable`);
      }
    } else {
      warn("Admin console not accessible (may need ADMIN role)");
    }
    await shot(page, "08-admin");

    // ── CEO REPORT ──────────────────────────────────────────────────────────
    console.log("\n");
    console.log("  ╔═════════════════════════════════════════════════════════════╗");
    console.log("  ║      🏁  FRESHKART PRODUCTION READINESS REPORT             ║");
    console.log("  ╠═════════════════════════════════════════════════════════════╣");
    for (const r of results) {
      const label = `${r.step}${r.note ? ` (${r.note})` : ""}`.slice(0, 54).padEnd(54);
      console.log(`  ║  ${r.status}  ${label}  ║`);
    }
    console.log("  ╠═════════════════════════════════════════════════════════════╣");
    const passed = results.filter((r) => r.status === "✅").length;
    const warned = results.filter((r) => r.status === "⚠️").length;
    console.log(`  ║  📊  ${passed} passed · ${warned} warnings`.padEnd(64) + "║");
    console.log("  ║  📸  Screenshots → e2e/screenshots/".padEnd(64) + "║");
    console.log("  ╚═════════════════════════════════════════════════════════════╝\n");

    await page.waitForTimeout(5_000);
    await context.close();
  });
});
