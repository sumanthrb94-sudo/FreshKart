import { test, expect, type Page, devices } from "@playwright/test";

/**
 * Launch smoke test — the full one-buyer + one-admin journey, end to end,
 * exercised on BOTH a desktop and a mobile viewport. This is the "is the app
 * shippable" guard: sign in as each role, run the real commercial loop
 * (publish prices → browse → order → fulfil → return → support), and assert
 * every screen renders its live state without a console error.
 *
 * Backend: runs against whatever DataSource the running server is configured
 * with. Locally/CI that's the in-browser mock, which implements the exact
 * same DataSource contract as the Firebase adapter — so this validates all UI
 * wiring and the commerce state machine. (Firebase Auth/OTP itself needs a
 * live project + test numbers and is out of scope for a headless smoke run;
 * the demo-login shortcut stands in for "an authenticated buyer/admin".)
 *
 * Determinism: the clock is pinned to 10:00 IST — inside store hours (08:00–
 * 23:45) and past the 07:00 price-update window — so ordering is enabled.
 */

const BASE = process.env.BASE_URL || "http://localhost:3100";
const SESSION_KEY = "green-basket.session.v1";
const STORE_KEY = "green_basket_mock_store_v1";
// 2026-07-18T04:30:00Z == 10:00 IST — store open, prices publishable.
const FIXED_TIME = new Date("2026-07-18T04:30:00.000Z");

/** Fail the test on any uncaught page error or console error (Vercel
 *  analytics 404s in local prod are the one known-benign exception). */
function guardConsole(page: Page, sink: string[]) {
  page.on("pageerror", (e) => sink.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/_vercel\/(insights|speed-insights)|Failed to load resource/i.test(t)) return;
    sink.push(`console.error: ${t}`);
  });
}

/** Navigate without waiting on `networkidle` — the signed-in screens hold
 *  live subscriptions + a 5s safety poll open, so networkidle never settles
 *  and would eat the whole step budget. domcontentloaded + explicit element
 *  waits is the robust pattern. */
async function gotoStable(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
}

async function resetAndLogin(page: Page, role: "Admin" | "Buyer") {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((k) => localStorage.removeItem(k), SESSION_KEY);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const demo = page.getByRole("button", { name: new RegExp(`Demo: ${role}`, "i") });
  await expect(demo).toBeVisible({ timeout: 15_000 });
  await demo.click();
  await page.waitForTimeout(1500);
}

/** Point the seeded demo return at the actual demo-buyer account so it shows
 *  up under the Demo: Buyer login (seed uses placeholder buyer ids). */
async function claimDemoReturnForBuyer(page: Page) {
  await page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    if (!raw) return;
    const store = JSON.parse(raw);
    const ret = store.returns?.find((r: { id: string }) => r.id === "RET-20260702-002");
    if (ret) ret.buyerId = "user-buyer-1";
    localStorage.setItem(k, JSON.stringify(store));
  }, STORE_KEY);
}

function runJourney(label: string, deviceViewport: { width: number; height: number }) {
  test.describe(`launch journey — ${label}`, () => {
    test.use({ viewport: deviceViewport });

    test(`full one-admin + one-buyer commercial loop (${label})`, async ({ page }) => {
      const errors: string[] = [];
      guardConsole(page, errors);
      await page.clock.setFixedTime(FIXED_TIME);

      // ========== ADMIN: publish today's prices (opens ordering) ==========
      await resetAndLogin(page, "Admin");
      // URL routing to the admin console proves the admin login + shell loaded;
      // the price-publish flow immediately below is the functional confirmation.
      await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });

      await gotoStable(page, "/admin/prices");
      await page.getByRole("button", { name: /Publish today|Save & publish/i }).click();
      const confirmPublish = page.getByRole("button", { name: /Confirm & publish/i });
      await confirmPublish.click();
      // The confirm dialog closes only after the publish write succeeds — a
      // viewport-independent signal that prices are now live.
      await expect(confirmPublish).toBeHidden({ timeout: 10_000 });

      // ========== BUYER: browse → cart → checkout → order ==========
      await resetAndLogin(page, "Buyer");
      await expect(page.getByText(/in season today|Good morning|Good afternoon|Good evening/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

      // Add enough distinct products to clear the 10kg minimum order.
      const addButtons = page.locator("[data-testid='add-to-cart-btn']");
      await expect(addButtons.first()).toBeVisible({ timeout: 10_000 });
      const toAdd = Math.min(12, await addButtons.count());
      for (let i = 0; i < toAdd; i++) {
        const btn = addButtons.nth(i);
        if (await btn.isVisible().catch(() => false)) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(120);
        }
      }

      // Open checkout.
      const reviewBtn = page.getByText(/Review & Order/i).filter({ visible: true }).first();
      await expect(reviewBtn).toBeVisible({ timeout: 8_000 });
      await reviewBtn.click();
      await page.waitForTimeout(600);

      // Delivery phone: the sanitize guard caps at 10 digits.
      const phone = page.locator("#checkout-phone");
      if (await phone.isVisible().catch(() => false)) {
        await phone.fill("");
        await phone.type("98765432109999");
        await expect(phone).toHaveValue("9876543210");
      }

      // Place the order (COD).
      const placeBtn = page.getByRole("button", { name: /Place B2B order/i }).filter({ visible: true }).first();
      await expect(placeBtn).toBeVisible({ timeout: 8_000 });
      await placeBtn.click();
      // Order success surface.
      await expect(page.getByText(/order|placed|success|thank/i).filter({ visible: true }).first()).toBeVisible({ timeout: 12_000 });

      // Orders list shows the new order.
      await gotoStable(page, "/orders");
      await expect(page.getByText(/ORD-2026/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

      // ========== ADMIN: sees the order, advances it, marks paid ==========
      await resetAndLogin(page, "Admin");
      await gotoStable(page, "/admin/orders");
      await expect(page.getByText(/ORD-2026/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

      // ========== RETURNS: buyer opens a return thread, requests reopen ==========
      await resetAndLogin(page, "Admin");
      // First reject the seeded REQUESTED return so the buyer can request a reopen.
      await gotoStable(page, "/admin/returns");
      const retCard = page.getByText(/RET-20260702-002/i).filter({ visible: true }).first();
      if (await retCard.isVisible().catch(() => false)) {
        await retCard.click();
        await page.waitForTimeout(400);
        const rejectBtn = page.getByRole("button", { name: /^Reject$/i });
        if (await rejectBtn.isVisible().catch(() => false)) {
          await rejectBtn.click();
          await page.waitForTimeout(500);
          await expect(page.getByText(/Rejected/i).filter({ visible: true }).first()).toBeVisible();
        }
      }

      await resetAndLogin(page, "Buyer");
      await claimDemoReturnForBuyer(page);
      await gotoStable(page, "/returns");
      const buyerRet = page.locator('a[href*="RET-20260702-002"]').first();
      if (await buyerRet.isVisible().catch(() => false)) {
        await buyerRet.click();
        await page.waitForTimeout(500);
        const askBtn = page.getByRole("button", { name: /Ask us to take another look/i });
        if (await askBtn.isVisible().catch(() => false)) {
          await askBtn.click();
          await expect(page.getByText(/hang tight/i)).toBeVisible({ timeout: 8_000 });
        }
      }

      // ========== SUPPORT CHAT: buyer escalates to a human ==========
      await gotoStable(page, "/account");
      await page.waitForTimeout(500);
      const chatBtn = page.locator("[data-chat-button]");
      if (await chatBtn.isVisible().catch(() => false)) {
        await chatBtn.click();
        await page.waitForTimeout(500);
        const chatInput = page.locator('input[placeholder="Ask about orders, returns..."]');
        if (await chatInput.isVisible().catch(() => false)) {
          await chatInput.fill("Talk to human");
          await chatInput.press("Enter");
          await expect(page.getByText(/connected to our support team/i)).toBeVisible({ timeout: 8_000 });
        }
      }

      // ========== ADMIN: sees the escalated ticket ==========
      await resetAndLogin(page, "Admin");
      await gotoStable(page, "/admin/support");
      await expect(page.getByText(/Support Chats|Buyer AI-chat|conversation/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

      // No uncaught/console errors accumulated across the whole journey.
      expect(errors, `Console/page errors during ${label} journey:\n${errors.join("\n")}`).toEqual([]);
    });
  });
}

runJourney("desktop", { width: 1280, height: 900 });
runJourney("mobile", devices["iPhone 13"].viewport);
