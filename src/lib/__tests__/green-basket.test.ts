/**
 * Unit Tests for Green Basket Business Logic
 * 
 * Test command: npx vitest run src/lib/__tests__
 * 
 * Covers:
 * - Status transitions
 * - Notification routing
 *
 * The AI chat tests lived here until the support chat was removed: buyers
 * reach the shop by phone now, so there is no bot left to match FAQs.
 */

import { describe, it, expect, vi } from "vitest";
import {
  notifications,
  notifyOrderStatus,
} from "../notifications";










// ============================================================================
// NOTIFICATION TESTS
// ============================================================================

describe("NotificationDispatcher", () => {
  it("isEmailEnabled returns false without env var", () => {
    expect(notifications.isEmailEnabled()).toBe(false);
  });

  it("isSmsEnabled returns false without env vars", () => {
    expect(notifications.isSmsEnabled()).toBe(false);
  });
});

describe("notifyOrderStatus", () => {
  it("does not throw for placeholder implementation", async () => {
    await expect(
      notifyOrderStatus(
        { userId: "test", email: "test@test.com", phone: "+919876543210" },
        "ORDER_PLACED"
      )
    ).resolves.not.toThrow();
  });
});


// ============================================================================
// INTEGRATION TESTS
// ============================================================================

