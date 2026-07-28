import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOTS_DIR = path.join("e2e", "screenshots", "desktop-ui");

async function shot(page, name: string) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const file = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸  ${file}`);
}

async function waitForLogin(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page
    .getByText(/Sign in to continue/i)
    .waitFor({ state: "visible", timeout: 20_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("Desktop UI — navigation & layout", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("login screen shows demo buttons and phone sign-in", async ({ page }) => {
    await waitForLogin(page);
    await expect(page.getByRole("button", { name: /Demo: Admin/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Demo: Buyer/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with mobile/i })).toBeVisible();
    await shot(page, "01-login-desktop");
  });

  test("buyer desktop shows persistent sidebar navigation", async ({ page }) => {
    await waitForLogin(page);
    await page.getByRole("button", { name: /Demo: Buyer/i }).click();
    await page.waitForURL(/\/$/, { timeout: 10_000 });
    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText(/Shop|Home|Orders|Account/i).first()).toBeVisible();
    await shot(page, "02-buyer-home-desktop");
  });

  test("buyer can navigate using desktop sidebar", async ({ page }) => {
    await waitForLogin(page);
    await page.getByRole("button", { name: /Demo: Buyer/i }).click();
    await page.waitForURL(/\/$/, { timeout: 10_000 });
    const sidebar = page.locator("aside").first();
    await sidebar.getByText(/Orders/i).first().click();
    await page.waitForURL(/\/orders$/, { timeout: 10_000 });
    await expect(page.locator("main").first()).toBeVisible();
    await shot(page, "03-buyer-orders-desktop");
  });

  test("admin desktop shows persistent sidebar navigation", async ({ page }) => {
    await waitForLogin(page);
    await page.getByRole("button", { name: /Demo: Admin/i }).click();
    await page.waitForURL(/\/admin$/, { timeout: 10_000 });
    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText(/Dashboard|Inventory|Orders|Buyers/i).first()).toBeVisible();
    await shot(page, "04-admin-dashboard-desktop");
  });
});

test.describe("Mobile UI — bottom navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("buyer mobile shows bottom navigation", async ({ page }) => {
    await waitForLogin(page);
    await page.getByRole("button", { name: /Demo: Buyer/i }).click();
    await page.waitForURL(/\/$/, { timeout: 10_000 });
    const nav = page.locator("nav").first();
    await expect(nav).toBeVisible();
    await shot(page, "05-buyer-home-mobile");
  });

  test("admin mobile shows bottom navigation", async ({ page }) => {
    await waitForLogin(page);
    await page.getByRole("button", { name: /Demo: Admin/i }).click();
    await page.waitForURL(/\/admin$/, { timeout: 10_000 });
    const nav = page.locator("nav").first();
    await expect(nav).toBeVisible();
    await shot(page, "06-admin-dashboard-mobile");
  });
});
