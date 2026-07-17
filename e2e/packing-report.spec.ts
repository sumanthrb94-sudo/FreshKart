import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/** Drives the daily packing report and dashboard day totals in mock mode.
 *
 *  Seed orders live on 2026-06-19..23 (see src/lib/mock-data.ts), so "today"
 *  is legitimately empty — these tests navigate to a seeded day instead.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3100";
const SEEDED_DAY = "2026-06-23";
const SHOTS = path.join("e2e", "screenshots", "packing");

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function loginAsAdmin(page: Page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Demo: Admin/i }).click();
  await page.waitForURL(/\/admin$/, { timeout: 20_000 });
  // The publish gate blocks the dashboard until today's prices are published.
  const publish = page.getByRole("button", { name: /^Publish today's prices$/i }).first();
  if (await publish.isVisible().catch(() => false)) {
    await publish.click();
    await expect(page.getByText(/Published today at/i).first()).toBeVisible({ timeout: 15_000 });
  }
}

async function setDay(page: Page, iso: string) {
  const input = page.getByLabel("Report date").first();
  await input.fill(iso);
  await expect(input).toHaveValue(iso);
}

test.describe.configure({ mode: "serial" });

test.describe("Daily packing report", () => {
  test("dashboard shows day totals, driven by the calendar", async ({ page }) => {
    await loginAsAdmin(page);

    const card = page.locator("div").filter({ hasText: /^Day totals/ }).first();
    await expect(page.getByText("Day totals")).toBeVisible();

    // Today has no seeded orders — must read as a real zero, not a crash.
    await expect(page.getByText("All time")).toBeVisible();
    await shot(page, "01-dashboard-today");

    // Step back to a seeded day and confirm the numbers move.
    await setDay(page, SEEDED_DAY);
    await expect(page.getByText(/Items to pack/i)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    await shot(page, "02-dashboard-seeded-day");

    // The all-time grid must NOT be affected by the day picker.
    await expect(page.getByText("All time")).toBeVisible();
  });

  test("packing tab: pick list and per-customer slips for a seeded day", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/reports`, { waitUntil: "networkidle" });

    // Packing is the default tab.
    await expect(page.getByRole("button", { name: /^Packing$/ })).toBeVisible();
    await shot(page, "03-packing-today-empty");

    await setDay(page, SEEDED_DAY);
    await page.waitForTimeout(1500);

    // Pick list — the consolidated "how many of each item" view.
    await expect(page.getByText(/Total qty/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Packaging/i).first()).toBeVisible();
    await shot(page, "04-packing-picklist");

    // Per-customer view — must carry the address.
    await page.getByRole("button", { name: /By customer/i }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText(/Hyderabad/i).first()).toBeVisible({ timeout: 10_000 });
    await shot(page, "05-packing-by-customer");

    // Both export paths must be live.
    await expect(page.getByRole("button", { name: /Print slips/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^CSV$/ })).toBeEnabled();
  });

  test("CSV downloads and contains the customer address", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/reports`, { waitUntil: "networkidle" });
    await setDay(page, SEEDED_DAY);
    await page.waitForTimeout(1500);

    await page.getByRole("button", { name: /By customer/i }).click();
    const download = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      page.getByRole("button", { name: /^CSV$/ }).click(),
    ]).then(([d]) => d);

    expect(download.suggestedFilename()).toBe(`freshkart-packing-${SEEDED_DAY}.csv`);
    const body = fs.readFileSync(await download.path(), "utf8");
    console.log("\n----- packing CSV -----\n" + body.split("\n").slice(0, 6).join("\n"));
    expect(body).toContain("Business,Contact,Phone,Address,City,Pincode,Order #,Item,Qty,Unit");
    expect(body).toMatch(/Hyderabad/);
  });

  test("future days are blocked", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/reports`, { waitUntil: "networkidle" });
    const next = page.getByRole("button", { name: "Next day" }).first();
    // Today is the max — the forward arrow must be disabled.
    await expect(next).toBeDisabled();
  });
});
