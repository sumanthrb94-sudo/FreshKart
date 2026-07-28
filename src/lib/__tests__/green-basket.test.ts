/**
 * Unit Tests for Green Basket Business Logic
 * 
 * Test command: npx vitest run src/lib/__tests__
 * 
 * Covers:
 * - Status transitions
 * - AI Chat FAQ matching
 * - Notification routing
 */

import { describe, it, expect, vi } from "vitest";
import {
  generateAIResponse,
  createChatSession,
  processUserMessage,
  matchFAQ,
} from "../ai-chat";
import {
  notifications,
  notifyOrderStatus,
} from "../notifications";










// ============================================================================
// AI CHAT TESTS
// ============================================================================

describe("generateAIResponse", () => {
  it("matches FAQ for exact keywords", () => {
    const result = generateAIResponse("what are your hours?");
    expect(result.text).toContain("9:00 AM to 10:00 PM");
  });

  it("matches FAQ for delivery keyword", () => {
    const result = generateAIResponse("delivery time?");
    expect(result.text).toContain("next-day");
  });

  it("provides suggestions with response", () => {
    const result = generateAIResponse("hours");
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.length).toBeGreaterThan(0);
  });

  it("gives fallback for unknown queries", () => {
    const result = generateAIResponse("xyz abc unknown");
    expect(result.text).toContain("Call Now");
    expect(result.suggestions).toBeDefined();
  });

  it("uses context for order_help", () => {
    const result = generateAIResponse("help with order", "order_help");
    expect(result.text.toLowerCase()).toContain("order");
  });

  it("uses context for returns", () => {
    const result = generateAIResponse("return item", "returns");
    expect(result.text.toLowerCase()).toContain("return");
  });
});

describe("createChatSession", () => {
  it("initializes with greeting message", () => {
    const session = createChatSession();
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe("assistant");
    expect(session.messages[0].text).toContain("Hello! I am Green Basket Assistant");
    expect(session.context).toBe("general");
  });

  it("has unique session ID", () => {
    const s1 = createChatSession();
    const s2 = createChatSession();
    expect(s1.id).not.toBe(s2.id);
  });
});

describe("processUserMessage", () => {
  it("adds user message and AI response", () => {
    const session = createChatSession();
    const { updatedSession, aiResponse } = processUserMessage(session, "store hours?");
    
    expect(updatedSession.messages).toHaveLength(3); // greeting + user + AI
    expect(updatedSession.messages[1].role).toBe("user");
    expect(updatedSession.messages[1].text).toBe("store hours?");
    expect(aiResponse.role).toBe("assistant");
  });

  it("detects returns context", () => {
    const session = createChatSession();
    const { updatedSession } = processUserMessage(session, "how do I return?");
    expect(updatedSession.context).toBe("returns");
  });

  it("detects order_help context", () => {
    const session = createChatSession();
    const { updatedSession } = processUserMessage(session, "track my order");
    expect(updatedSession.context).toBe("order_help");
  });
});

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

