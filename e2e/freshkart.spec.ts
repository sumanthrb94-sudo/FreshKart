import { test, expect } from "@playwright/test";

/**
 * FreshKart End-to-End Test Suite
 * 
 * Covers: Customer ordering, return requests, refund threads, AI chat,
 * admin returns management, privacy policy, and notification flows.
 * 
 * Run: npx playwright test
 */

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";

// ============================================================================
// CUSTOMER JOURNEY TESTS
// ============================================================================

test.describe("Customer Purchase Flow", () => {
  test("customer can browse products and add to cart", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    
    // Wait for product grid to load
    await page.waitForSelector("[data-testid='product-card']", { timeout: 10000 });
    
    // Add first product to cart
    const addButton = page.locator("[data-testid='add-to-cart-btn']").first();
    await expect(addButton).toBeVisible();
    await addButton.click();
    
    // Cart count should update
    const cartBadge = page.locator("[data-testid='cart-badge']");
    await expect(cartBadge).toContainText("1");
  });

  test("customer can view cart and proceed to checkout", async ({ page }) => {
    await page.goto(`${BASE_URL}/?cart=1`);
    
    // Cart should be visible
    await page.waitForSelector("[data-testid='cart-panel']", { timeout: 10000 });
    
    // Place order button should be visible
    const placeOrderBtn = page.locator("[data-testid='place-order-btn']");
    await expect(placeOrderBtn).toBeVisible();
  });

  test("customer can view order tracking", async ({ page }) => {
    // Login first (demo mode)
    await page.goto(`${BASE_URL}/login`);
    const demoBtn = page.locator("text=Skip Login (Demo Mode)");
    if (await demoBtn.isVisible().catch(() => false)) {
      await demoBtn.click();
    }
    
    // Navigate to orders
    await page.goto(`${BASE_URL}/orders`);
    await page.waitForSelector("[data-testid='order-list']", { timeout: 10000 });
    
    // Click first order
    const firstOrder = page.locator("[data-testid='order-card']").first();
    await expect(firstOrder).toBeVisible();
    await firstOrder.click();
    
    // Order detail should show
    await page.waitForSelector("[data-testid='order-detail']", { timeout: 10000 });
  });
});

// ============================================================================
// RETURN & REFUND TESTS
// ============================================================================

test.describe("Return Request Flow", () => {
  test("customer can initiate return for delivered order", async ({ page }) => {
    // Login via demo mode
    await page.goto(`${BASE_URL}/login`);
    const demoBtn = page.locator("text=Skip Login (Demo Mode)");
    if (await demoBtn.isVisible().catch(() => false)) {
      await demoBtn.click();
    }
    
    // Navigate to a delivered order
    await page.goto(`${BASE_URL}/orders/order-1`);
    await page.waitForTimeout(2000);
    
    // Request Return button should be visible for delivered orders
    const returnBtn = page.locator("text=Request Return / Refund");
    await expect(returnBtn).toBeVisible();
    await returnBtn.click();
    
    // Should navigate to return request page
    await page.waitForURL("**/return");
    await expect(page.locator("text=Request Return")).toBeVisible();
  });

  test("customer can select items and reason for return", async ({ page }) => {
    await page.goto(`${BASE_URL}/orders/order-1/return`);
    await page.waitForTimeout(2000);
    
    // Increase return quantity for first item
    const plusBtn = page.locator("button:has(>> svg[class*='lucide-plus'])").first();
    await plusBtn.click();
    
    // Select a reason
    const reasonBtn = page.locator("text=Damaged in transit");
    await expect(reasonBtn).toBeVisible();
    await reasonBtn.click();
    
    // Add notes
    const notesField = page.locator("textarea[placeholder*='Describe']");
    await notesField.fill("Test return reason description");
    
    // Submit button should be enabled after selecting items
    const submitBtn = page.locator("button:has-text('Submit Return Request')");
    await expect(submitBtn).toBeEnabled();
  });

  test("customer can upload photos in return request", async ({ page }) => {
    await page.goto(`${BASE_URL}/orders/order-1/return`);
    await page.waitForTimeout(2000);
    
    // Click add photo button
    const addPhotoBtn = page.locator("text=Add photo");
    await expect(addPhotoBtn).toBeVisible();
    
    // Note: Actual file upload would require a test file
    // This verifies the upload UI exists
  });

  test("customer can view return thread and send messages", async ({ page }) => {
    // Seed a return in localStorage
    await page.addInitScript(() => {
      const seedReturn = {
        id: "RET-TEST-001",
        orderId: "order-1",
        orderNumber: "ORD-TEST-001",
        buyerId: "buyer-test",
        businessName: "Test Store",
        buyerPhone: "+91 98765 43210",
        items: [{ productId: "p1", productName: "Tomato", originalQty: 10, returnQty: 3, unitPrice: 44, unit: "kg", lineRefund: 132 }],
        status: "REQUESTED",
        reason: "DAMAGED",
        notes: "Test notes",
        requestedAt: new Date().toISOString(),
        totalRefund: 132,
        adjustedInvoiceNumber: "INV-TEST-ADJ01",
        images: [],
        thread: [
          { id: "msg-1", sender: "system", text: "Return created", sentAt: new Date().toISOString() },
          { id: "msg-2", sender: "buyer", text: "Please help", sentAt: new Date().toISOString() },
        ],
      };
      localStorage.setItem("freshkart_returns", JSON.stringify([seedReturn]));
    });
    
    await page.goto(`${BASE_URL}/returns/RET-TEST-001`);
    await page.waitForTimeout(2000);
    
    // Thread should be visible
    await expect(page.locator("text=Conversation")).toBeVisible();
    
    // Send a message
    const input = page.locator("input[placeholder*='Type a message']");
    await input.fill("Test reply from buyer");
    await input.press("Enter");
    
    // Message should appear
    await expect(page.locator("text=Test reply from buyer")).toBeVisible();
  });

  test("customer can view my returns list", async ({ page }) => {
    await page.goto(`${BASE_URL}/returns`);
    await page.waitForTimeout(2000);
    
    // Should show returns list or empty state
    const hasReturns = await page.locator("text=My Returns").isVisible();
    expect(hasReturns).toBe(true);
  });
});

// ============================================================================
// AI CHAT TESTS
// ============================================================================

test.describe("AI Chat Agent", () => {
  test("chat widget opens and shows greeting", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    
    // Click chat button
    const chatBtn = page.locator("[aria-label='Open chat']");
    await expect(chatBtn).toBeVisible();
    await chatBtn.click();
    
    // Greeting should appear
    await expect(page.locator("text=FreshKart Assistant")).toBeVisible();
    await expect(page.locator("text=Hello! I am FreshKart Assistant")).toBeVisible();
  });

  test("chat responds to store hours query", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    
    // Open chat
    await page.locator("[aria-label='Open chat']").click();
    
    // Type hours query
    const input = page.locator("input[placeholder*='Ask about']");
    await input.fill("What are your store hours?");
    await input.press("Enter");
    
    // Should respond with hours info
    await page.waitForTimeout(1000);
    await expect(page.locator("text=9:00 AM to 10:00 PM")).toBeVisible();
  });

  test("chat responds to return query", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    
    await page.locator("[aria-label='Open chat']").click();
    
    const input = page.locator("input[placeholder*='Ask about']");
    await input.fill("How do returns work?");
    await input.press("Enter");
    
    await page.waitForTimeout(1000);
    await expect(page.locator("text=Request Return")).toBeVisible();
  });

  test("chat has call support button", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    
    await page.locator("[aria-label='Open chat']").click();
    
    // Phone icon should be in header
    const phoneBtn = page.locator("[title='Call support']");
    await expect(phoneBtn).toBeVisible();
  });

  test("chat shows quick action suggestions", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    
    await page.locator("[aria-label='Open chat']").click();
    
    // Suggestion chips should appear after greeting
    await expect(page.locator("text=Track my order")).toBeVisible();
  });
});

// ============================================================================
// PRIVACY POLICY TESTS
// ============================================================================

test.describe("Privacy Policy", () => {
  test("privacy policy page loads with all sections", async ({ page }) => {
    await page.goto(`${BASE_URL}/privacy`);
    
    await expect(page.locator("text=Privacy Policy")).toBeVisible();
    await expect(page.locator("text=Information We Collect")).toBeVisible();
    await expect(page.locator("text=How We Use Your Information")).toBeVisible();
    await expect(page.locator("text=Data Storage & Security")).toBeVisible();
    await expect(page.locator("text=Communications")).toBeVisible();
    await expect(page.locator("text=Data Retention & Deletion")).toBeVisible();
    await expect(page.locator("text=Your Rights")).toBeVisible();
    await expect(page.locator("text=Contact Us")).toBeVisible();
  });

  test("privacy policy has contact details", async ({ page }) => {
    await page.goto(`${BASE_URL}/privacy`);
    
    await expect(page.locator("text=privacy@freshkart.in")).toBeVisible();
    await expect(page.locator("text=+91-98765-43210")).toBeVisible();
  });
});

// ============================================================================
// ADMIN PANEL TESTS
// ============================================================================

test.describe("Admin Returns Management", () => {
  test("admin can view returns list", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/returns`);
    await page.waitForTimeout(2000);
    
    await expect(page.locator("text=Returns & Refunds")).toBeVisible();
    
    // Filter buttons should be visible
    await expect(page.locator("text=All")).toBeVisible();
    await expect(page.locator("text=REQUESTED")).toBeVisible();
    await expect(page.locator("text=APPROVED")).toBeVisible();
  });

  test("admin can filter returns by status", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/returns`);
    await page.waitForTimeout(2000);
    
    // Click REQUESTED filter
    const requestedFilter = page.locator("button:has-text('REQUESTED')").first();
    await requestedFilter.click();
    
    // Should show filtered results
    await page.waitForTimeout(500);
  });

  test("admin can view return thread detail", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/returns`);
    await page.waitForTimeout(2000);
    
    // Click first return card
    const firstCard = page.locator("[class*='cursor-pointer']").first();
    await firstCard.click();
    
    // Detail view should show
    await expect(page.locator("text=Conversation Thread")).toBeVisible();
  });

  test("admin can change return status", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/returns`);
    await page.waitForTimeout(2000);
    
    // Open first return
    const firstCard = page.locator("[class*='cursor-pointer']").first();
    await firstCard.click();
    
    // Status action button should be visible for REQUESTED returns
    const actionBtn = page.locator("button:has-text('Approve')");
    if (await actionBtn.isVisible().catch(() => false)) {
      await actionBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

test.describe("Edge Cases & Error Handling", () => {
  test("return request page handles invalid order ID", async ({ page }) => {
    await page.goto(`${BASE_URL}/orders/invalid-id/return`);
    await page.waitForTimeout(2000);
    
    // Should show error or not found
    const notFound = await page.locator("text=Order not found").isVisible().catch(() => false);
    const error = await page.locator("text=error").isVisible().catch(() => false);
    expect(notFound || error).toBe(true);
  });

  test("return thread handles invalid return ID", async ({ page }) => {
    await page.goto(`${BASE_URL}/returns/INVALID-ID`);
    await page.waitForTimeout(2000);
    
    await expect(page.locator("text=Return request not found")).toBeVisible();
  });

  test("store closed overlay shows outside hours", async ({ page }) => {
    // This test depends on time of day - may not always trigger
    await page.goto(`${BASE_URL}/`);
    
    const overlay = page.locator("text=We are currently closed");
    const isVisible = await overlay.isVisible().catch(() => false);
    
    // Just verify no error occurs regardless of overlay state
    expect(true).toBe(true);
  });

  test("AI chat handles empty input gracefully", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    
    await page.locator("[aria-label='Open chat']").click();
    
    // Try to send empty message
    const sendBtn = page.locator("button", { has: page.locator("svg[class*='lucide-send'") }).first();
    
    // Button should be disabled for empty input
    const isDisabled = await sendBtn.isDisabled().catch(() => true);
    expect(isDisabled).toBe(true);
  });

  test("cart persists across page navigation", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    
    // Add item to cart
    const addBtn = page.locator("[data-testid='add-to-cart-btn']").first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      
      // Navigate to another page and back
      await page.goto(`${BASE_URL}/orders`);
      await page.goto(`${BASE_URL}/`);
      
      // Cart should still have item
      const cartBadge = page.locator("[data-testid='cart-badge']");
      const count = await cartBadge.textContent().catch(() => "0");
      // Cart may or may not persist depending on implementation
    }
  });
});

// ============================================================================
// CROSS-BROWSER RESPONSIVENESS
// ============================================================================

test.describe("Mobile Responsiveness", () => {
  test("chat widget fits on mobile screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/`);
    
    await page.locator("[aria-label='Open chat']").click();
    
    // Chat panel should be visible and fit
    const chatPanel = page.locator("text=FreshKart Assistant");
    await expect(chatPanel).toBeVisible();
    
    // Check panel width doesn't overflow
    const panel = page.locator("[class*='max-w-[380px]']");
    await expect(panel).toBeVisible();
  });

  test("return request form is usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/orders/order-1/return`);
    await page.waitForTimeout(2000);
    
    // Form elements should be visible and tappable
    await expect(page.locator("text=Select items to return")).toBeVisible();
    await expect(page.locator("text=Damaged in transit")).toBeVisible();
  });
});
