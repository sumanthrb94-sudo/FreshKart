import { test, expect, type Page, type BrowserContext } from "@playwright/test";

/** Invoice lifecycle + returns/refunds, driven end-to-end with the buyer and
 *  admin in PARALLEL tabs of one browser context — the demo topology the mock
 *  backend's cross-tab (localStorage `storage` event) sync is built for.
 *
 *  Business rules under test:
 *   - An invoice exists only once an order is DELIVERED.
 *   - A CANCELLED order never gets an invoice.
 *   - A processed refund immediately adjusts the order (total, refund line,
 *     adjusted invoice number) and the buyer sees it in real time.
 *
 *  The app clock is pinned to 10:00 AM IST so the 8:00–23:45 store-hours gate
 *  never blocks checkout regardless of when the suite runs.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3100";
// 2026-07-18T04:30:00Z == 10:00 AM IST — mid business hours, after the 7 AM price cutoff.
const FIXED_TIME = new Date("2026-07-18T04:30:00.000Z");
const SESSION_KEY = "green-basket.session.v1";
const STORE_KEY = "green_basket_mock_store_v1";

test.describe.configure({ mode: "serial" });

async function newAppPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.clock.setFixedTime(FIXED_TIME);
  return page;
}

/** Wipe all app state so each test starts from the seed data. */
async function wipeState(page: Page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
}

/** Land on the sign-in screen even if another tab's session is already in the
 *  shared localStorage — a full load with a session present hydrates straight
 *  into that user's app instead of showing the demo-login buttons. */
async function gotoSignIn(page: Page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate((k) => localStorage.removeItem(k), SESSION_KEY);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
}

async function loginBuyer(page: Page): Promise<string> {
  await gotoSignIn(page);
  await page.getByRole("button", { name: /Demo: Buyer/i }).click();
  await page.waitForTimeout(800);
  const session = await page.evaluate((k) => localStorage.getItem(k), SESSION_KEY);
  expect(session, "buyer session captured").toBeTruthy();
  return session!;
}

async function loginAdmin(page: Page): Promise<string> {
  await gotoSignIn(page);
  await page.getByRole("button", { name: /Demo: Admin/i }).click();
  await page.waitForURL(/\/admin$/, { timeout: 20_000 });
  // The publish gate appears only after the settings loader resolves — wait
  // for it rather than sampling visibility instantly (racy).
  const publish = page.getByRole("button", { name: /^Publish today's prices$/i }).first();
  const gated = await publish.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
  if (gated) {
    await publish.click();
    await expect(page.getByText(/Published today at/i).first()).toBeVisible({ timeout: 15_000 });
  }
  const session = await page.evaluate((k) => localStorage.getItem(k), SESSION_KEY);
  expect(session, "admin session captured").toBeTruthy();
  return session!;
}

/** Both tabs share one localStorage, so before any FULL page load the tab must
 *  put its own session back (in-memory React state is per-tab; hydration isn't). */
async function gotoAs(page: Page, session: string, url: string) {
  await page.evaluate(
    ([k, v]) => localStorage.setItem(k, v),
    [SESSION_KEY, session] as const
  );
  await page.goto(url, { waitUntil: "networkidle" });
}

/** Click Add on product cards until the sticky bar offers "Review & Order"
 *  (each Add is that product's min qty; the whole-order minimum is 10 kg). */
async function addToCartUntilMinimum(page: Page) {
  for (let i = 0; i < 15; i++) {
    if (await page.getByText(/Review & Order/i).first().isVisible().catch(() => false)) return;
    const addButtons = page.locator("[data-testid='add-to-cart-btn']");
    if ((await addButtons.count()) === 0) break;
    await addButtons.first().click();
    await page.waitForTimeout(250);
  }
  await expect(page.getByText(/Review & Order/i).first()).toBeVisible({ timeout: 5_000 });
}

async function readStore(page: Page): Promise<any> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), STORE_KEY);
}

/** Open an order's detail sheet on /admin/orders via the search box. */
async function openAdminOrder(page: Page, adminSession: string, orderNumber: string) {
  await gotoAs(page, adminSession, `${BASE_URL}/admin/orders`);
  await page.getByPlaceholder(/search/i).first().fill(orderNumber);
  await page.waitForTimeout(400);
  // Desktop table rows open via their explicit "Open" action.
  await page.getByText(/^Open$/).filter({ visible: true }).first().click();
  await page.waitForTimeout(500);
}

test("invoice availability is gated by order status (admin order sheets)", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await newAppPage(context);
  await wipeState(page);
  const adminSession = await loginAdmin(page);

  // PENDING order → no invoice yet, waiting note instead.
  await openAdminOrder(page, adminSession, "ORD-20260623-MN44Xy");
  await expect(page.getByText(/Invoice available after delivery/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Download Invoice/i })).toHaveCount(0);

  // CANCELLED order → explicitly no invoice, ever.
  await openAdminOrder(page, adminSession, "ORD-20260619-CC10AA");
  await expect(page.getByText(/No invoice — order was cancelled/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Download Invoice/i })).toHaveCount(0);

  // DELIVERED order → invoice downloadable.
  await openAdminOrder(page, adminSession, "ORD-20260620-7HK2Q2");
  await expect(page.getByRole("button", { name: /Download Invoice/i })).toBeVisible();

  await context.close();
});

test("buyer sees invoice only after delivery on their own orders", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await newAppPage(context);
  await wipeState(page);
  const buyerSession = await loginBuyer(page);

  // SHIPPED — not yet.
  await gotoAs(page, buyerSession, `${BASE_URL}/orders/order-2`);
  await expect(page.getByText(/Invoice available after delivery/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Download Invoice/i })).toHaveCount(0);

  // DELIVERED — yes, and the invoice itself renders as a tax invoice.
  await gotoAs(page, buyerSession, `${BASE_URL}/orders/order-1`);
  const btn = page.getByRole("button", { name: /Download Invoice/i });
  await expect(btn).toBeVisible();
  const [popup] = await Promise.all([page.waitForEvent("popup"), btn.click()]);
  await popup.waitForLoadState("domcontentloaded");
  const html = await popup.content();
  expect(html).toContain("Tax Invoice");
  expect(html).toContain("ORD-20260620-7HK2Q2");
  expect(html).not.toContain("-ADJ"); // no refund yet → base invoice number
  await popup.close();

  await context.close();
});

test("full lifecycle in parallel tabs: place → advance to DELIVERED live → invoice appears", async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext();

  const buyerTab = await newAppPage(context);
  await wipeState(buyerTab);
  const buyerSession = await loginBuyer(buyerTab);

  const adminTab = await newAppPage(context);
  const adminSession = await loginAdmin(adminTab);

  // --- Buyer places an order (store open + prices published under fixed clock) ---
  await gotoAs(buyerTab, buyerSession, `${BASE_URL}/`);
  await buyerTab.waitForSelector("[data-testid='product-card']", { timeout: 15_000 });
  await addToCartUntilMinimum(buyerTab);
  await buyerTab.getByText(/Review & Order/i).filter({ visible: true }).first().click();
  await expect(buyerTab.getByText(/Your order/i).first()).toBeVisible();
  await buyerTab.getByRole("button", { name: /Place B2B order/i }).click();
  await expect(buyerTab.getByText(/Order placed!/i)).toBeVisible({ timeout: 15_000 });

  const orderNumber = (await buyerTab
    .locator("text=/ORD-\\d{8}-[A-Z0-9]{6}/")
    .first()
    .textContent())!.trim();

  const store = await readStore(buyerTab);
  const placed = store.orders.find((o: any) => o.orderNumber === orderNumber);
  expect(placed, "placed order persisted").toBeTruthy();
  // Orders are auto-confirmed at creation (pre-order for next-day delivery).
  expect(placed.status).toBe("CONFIRMED");

  // Buyer parks on the tracking page — must NOT need to reload from here on.
  await gotoAs(buyerTab, buyerSession, `${BASE_URL}/orders/${placed.id}`);
  await expect(buyerTab.getByText(/Invoice available after delivery/i)).toBeVisible();

  // --- Admin advances the order to DELIVERED; buyer watches it live ---
  await openAdminOrder(adminTab, adminSession, orderNumber);
  const expected: Array<[string, RegExp]> = [
    ["Packed", /Mark Packed/i],
    ["Shipped", /Mark Shipped/i],
    ["Delivered", /Mark Delivered/i],
  ];
  for (const [label, action] of expected) {
    await adminTab.getByRole("button", { name: action }).click();
    await adminTab.waitForTimeout(600);
    // Cross-tab live update: the buyer's tracking page reflects the new status
    // without any reload.
    await expect(buyerTab.getByText(label).first()).toBeVisible({ timeout: 10_000 });
  }

  // Invoice unlocks the moment the order is DELIVERED.
  const invoiceBtn = buyerTab.getByRole("button", { name: /Download Invoice/i });
  await expect(invoiceBtn).toBeVisible({ timeout: 10_000 });
  // Return window opens too (just delivered under the fixed clock).
  await expect(buyerTab.getByText(/Request Return \/ Refund/i)).toBeVisible();

  const [popup] = await Promise.all([buyerTab.waitForEvent("popup"), invoiceBtn.click()]);
  await popup.waitForLoadState("domcontentloaded");
  const html = await popup.content();
  expect(html).toContain("Tax Invoice");
  expect(html).toContain(orderNumber);
  await popup.close();

  // --- Return → refund: buyer requests (with a photo), admin processes, buyer sees it live ---
  await buyerTab.getByText(/Request Return \/ Refund/i).click();
  await buyerTab.waitForURL(/\/return$/, { timeout: 15_000 });
  await expect(buyerTab.getByText(/Select items to return/i)).toBeVisible();
  // Return 1 unit of the first line item.
  await buyerTab.locator("button:has(svg.lucide-plus)").first().click();
  await buyerTab.getByRole("button", { name: /Damaged in transit/i }).click();
  // Attach a damage photo — must be persisted somewhere the admin can load it
  // from, NOT a blob: URL that only exists inside this buyer tab.
  await buyerTab.locator("input[type='file']").setInputFiles({
    name: "damage-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAGElEQVR4nGP8z8Dwn4EIwESMolGF1FMIAF9vAh31KLW+AAAAAElFTkSuQmCC",
      "base64"
    ),
  });
  await expect(buyerTab.locator("img[alt='damage-photo.png']")).toBeVisible({ timeout: 10_000 });
  await buyerTab.getByRole("button", { name: /Submit Return Request/i }).click();
  await buyerTab.waitForTimeout(1500);

  const storeAfterReturn = await readStore(buyerTab);
  const ret = storeAfterReturn.returns.find((r: any) => r.orderNumber === orderNumber);
  expect(ret, "return request persisted").toBeTruthy();
  expect(ret.status).toBe("REQUESTED");
  expect(ret.totalRefund).toBeGreaterThan(0);
  expect(ret.adjustedInvoiceNumber).toBe(`INV-${orderNumber}-ADJ01`);
  // The persisted photo URL must be portable (data:/https:), never blob:.
  expect(ret.images.length).toBe(1);
  expect(ret.images[0].url).not.toMatch(/^blob:/);
  expect(ret.images[0].url).toMatch(/^(data:image|https:)/);

  // Buyer parks back on the order page to observe the refund arrive live.
  await gotoAs(buyerTab, buyerSession, `${BASE_URL}/orders/${placed.id}`);
  await expect(buyerTab.getByText(/^Refund$/)).toHaveCount(0);

  // Admin: REQUESTED → APPROVED → PICKED_UP → REFUNDED, with correctly-labeled actions.
  await gotoAs(adminTab, adminSession, `${BASE_URL}/admin/returns`);
  // Scope to our return via the search box (the order number also appears in
  // an off-screen notification toast — don't let getByText match that).
  await adminTab.getByPlaceholder(/Search by order/i).fill(orderNumber);
  await adminTab.waitForTimeout(400);
  await adminTab.getByText(/Suresh Kirana Store/i).filter({ visible: true }).first().click();
  await adminTab.waitForTimeout(400);
  // The buyer's damage photo must be VISIBLE TO THE ADMIN — and actually
  // decode to pixels (naturalWidth > 0), not just render a broken-image tag.
  await expect(adminTab.getByText(/Photos from buyer/i)).toBeVisible();
  const adminPhoto = adminTab.locator("img[alt='damage-photo.png']");
  await expect(adminPhoto).toBeVisible();
  await expect
    .poll(async () => adminPhoto.evaluate((el: HTMLImageElement) => el.naturalWidth), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  await expect(adminTab.getByRole("button", { name: /^Reject$/ })).toBeVisible();
  await adminTab.getByRole("button", { name: /^Approve$/ }).click();
  await adminTab.waitForTimeout(600);
  await adminTab.getByRole("button", { name: /Mark Picked Up/i }).click();
  await adminTab.waitForTimeout(600);
  await adminTab.getByRole("button", { name: /Process Refund/i }).click();
  await adminTab.waitForTimeout(600);

  const storeAfterRefund = await readStore(adminTab);
  const refunded = storeAfterRefund.orders.find((o: any) => o.orderNumber === orderNumber);
  expect(storeAfterRefund.returns.find((r: any) => r.orderNumber === orderNumber).status).toBe("REFUNDED");
  expect(refunded.refundAmount).toBe(ret.totalRefund);
  expect(refunded.total).toBe(Math.max(0, refunded.subtotal + refunded.deliveryFee - ret.totalRefund));
  expect(refunded.adjustedInvoiceNumber).toBe(`INV-${orderNumber}-ADJ01`);

  // Buyer's tracking page reflects the refund WITHOUT any reload.
  await expect(buyerTab.getByText(/Refund of ₹[\d,]+ processed/)).toBeVisible({ timeout: 10_000 });
  await expect(buyerTab.getByText(/^Refund$/)).toBeVisible();

  // The invoice regenerates against the adjusted numbers.
  const [adjPopup] = await Promise.all([
    buyerTab.waitForEvent("popup"),
    buyerTab.getByRole("button", { name: /Download Invoice/i }).click(),
  ]);
  await adjPopup.waitForLoadState("domcontentloaded");
  const adjHtml = await adjPopup.content();
  expect(adjHtml).toContain(`INV-${orderNumber}-ADJ01`);
  expect(adjHtml).toContain("Refund Note");
  await adjPopup.close();

  // Close out the return.
  await adminTab.getByRole("button", { name: /Mark Complete/i }).click();
  await adminTab.waitForTimeout(600);
  const finalStore = await readStore(adminTab);
  expect(finalStore.returns.find((r: any) => r.orderNumber === orderNumber).status).toBe("COMPLETED");

  await context.close();
});

test("cancelled order never gets an invoice (buyer cancels, both sides agree)", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();

  const buyerTab = await newAppPage(context);
  await wipeState(buyerTab);
  const buyerSession = await loginBuyer(buyerTab);

  const adminTab = await newAppPage(context);
  const adminSession = await loginAdmin(adminTab);

  // Buyer places an order…
  await gotoAs(buyerTab, buyerSession, `${BASE_URL}/`);
  await buyerTab.waitForSelector("[data-testid='product-card']", { timeout: 15_000 });
  await addToCartUntilMinimum(buyerTab);
  await buyerTab.getByText(/Review & Order/i).filter({ visible: true }).first().click();
  await buyerTab.getByRole("button", { name: /Place B2B order/i }).click();
  await expect(buyerTab.getByText(/Order placed!/i)).toBeVisible({ timeout: 15_000 });
  const orderNumber = (await buyerTab
    .locator("text=/ORD-\\d{8}-[A-Z0-9]{6}/")
    .first()
    .textContent())!.trim();
  const store = await readStore(buyerTab);
  const placed = store.orders.find((o: any) => o.orderNumber === orderNumber);

  // …then cancels it while still PENDING.
  await gotoAs(buyerTab, buyerSession, `${BASE_URL}/orders/${placed.id}`);
  await buyerTab.getByRole("button", { name: /Cancel order/i }).click();
  // Live subscription flips the page to CANCELLED without a reload.
  await expect(buyerTab.getByText(/Cancelled/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(buyerTab.getByText(/No invoice — order was cancelled/i)).toBeVisible();
  await expect(buyerTab.getByRole("button", { name: /Download Invoice/i })).toHaveCount(0);

  // Admin's sheet for the same order agrees.
  await openAdminOrder(adminTab, adminSession, orderNumber);
  await expect(adminTab.getByText(/No invoice — order was cancelled/i)).toBeVisible();
  await expect(adminTab.getByRole("button", { name: /Download Invoice/i })).toHaveCount(0);

  await context.close();
});

test("rejected return leaves the order and its invoice untouched", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await newAppPage(context);
  await wipeState(page);
  const adminSession = await loginAdmin(page);

  const before = await readStore(page);
  const order2Before = before.orders.find((o: any) => o.id === "order-2");

  await gotoAs(page, adminSession, `${BASE_URL}/admin/returns`);
  // Seeded RET-20260702-002 (Priya Restaurant) is still REQUESTED.
  await page.getByText(/Priya Restaurant/i).first().click();
  await page.waitForTimeout(400);
  await expect(page.getByRole("button", { name: /^Approve$/ })).toBeVisible();
  await page.getByRole("button", { name: /^Reject$/ }).click();
  await page.waitForTimeout(600);

  const after = await readStore(page);
  expect(after.returns.find((r: any) => r.id === "RET-20260702-002").status).toBe("REJECTED");
  const order2After = after.orders.find((o: any) => o.id === "order-2");
  expect(order2After.total).toBe(order2Before.total);
  expect(order2After.refundAmount).toBeUndefined();

  await context.close();
});
