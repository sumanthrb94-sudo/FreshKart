import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end UI wiring for PHONE ↔ EMAIL account linking, driven against the
 * running app. This file covers only what the browser can reach on its own;
 * the fake-number / disposable-email *logic* (isPlausibleIndianMobile,
 * isLinkableEmail, toE164, normalizeEmail) is pinned exhaustively by
 * src/lib/__tests__/phone-email-linking.test.ts.
 *
 * WHY THE SPLIT: the OTP send step and the onboarding "link your other
 * contact" step only run when Firebase Auth is configured (firebaseConfigured
 * === true) with a phone test-number set in the Firebase console. In the
 * default local/mock backend the sign-in card renders but the invisible
 * reCAPTCHA never arms, so "Continue with mobile" stays disabled by design and
 * the OTP/link screens aren't reachable. The assertions below therefore target
 * the parts that ARE always live:
 *   - the sign-in phone field's garbage-input sanitization (the anti-fake /
 *     anti-fat-finger guard at the very first linking touch-point),
 *   - the disabled-until-valid submit gate,
 *   - which linking methods the mock backend actually offers.
 *
 * To exercise the full OTP→link flow end-to-end, run against a Firebase-backed
 * deploy with a test phone number (Firebase console → Authentication →
 * Sign-in method → Phone → "Phone numbers for testing").
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3100";
const SESSION_KEY = "green-basket.session.v1";

async function gotoSignIn(page: Page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate((k) => localStorage.removeItem(k), SESSION_KEY);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
}

/** The +91 mobile field on the sign-in card (aria-label "Mobile number"). */
function phoneField(page: Page) {
  return page.getByLabel("Mobile number").first();
}

test.describe("phone/email linking — sign-in entry point", () => {
  test("the mobile field strips non-digits and hard-caps at 10 digits", async ({ page }) => {
    await gotoSignIn(page);
    const phone = phoneField(page);
    await expect(phone).toBeVisible({ timeout: 10_000 });

    // Paste an over-long, mixed string — the field must sanitize to exactly the
    // 10 national digits, never store a 19-digit or letter-laden value that
    // could later masquerade as a "linked" phone.
    await phone.fill("");
    await phone.type("9876543210987654321abc");
    await expect(phone).toHaveValue("9876543210");
  });

  test("a valid 10-digit number is preserved as typed", async ({ page }) => {
    await gotoSignIn(page);
    const phone = phoneField(page);
    await expect(phone).toBeVisible({ timeout: 10_000 });

    await phone.fill("");
    await phone.type("9876501234");
    await expect(phone).toHaveValue("9876501234");
  });

  test("'Continue with mobile' stays disabled until 10 digits are entered", async ({ page }) => {
    await gotoSignIn(page);
    const phone = phoneField(page);
    await expect(phone).toBeVisible({ timeout: 10_000 });

    const submit = page.getByRole("button", { name: /Continue with mobile/i });
    await expect(submit).toBeVisible();

    // Fewer than 10 digits → disabled.
    await phone.fill("");
    await phone.type("98765");
    await expect(submit).toBeDisabled();

    // Note: at a full 10 digits the button is still gated on the invisible
    // reCAPTCHA arming, which only happens under a real Firebase config — so we
    // assert the length gate here, not that it becomes enabled.
    await phone.fill("");
    await phone.type("9876501234");
    await expect(phone).toHaveValue("9876501234");
  });

  test("mock backend offers demo + phone linking, and does not surface Google", async ({ page }) => {
    // Documents the linking methods available without Firebase: the two demo
    // shortcuts and the phone field. The Google button only renders when
    // api.signInWithGoogle exists (Firebase backend), so it must be absent here.
    await gotoSignIn(page);
    await expect(page.getByRole("button", { name: /Demo: Admin/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Demo: Buyer/i })).toBeVisible();
    await expect(phoneField(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toHaveCount(0);
  });
});
