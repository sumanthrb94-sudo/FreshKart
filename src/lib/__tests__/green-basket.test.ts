/**
 * Unit Tests for Green Basket Business Logic
 * 
 * Test command: npx vitest run src/lib/__tests__
 * 
 * Covers:
 * - Returns & Refunds calculations
 * - Status transitions
 * - AI Chat FAQ matching
 * - Notification routing
 */

import { describe, it, expect, vi } from "vitest";
import {
  calculateRefund,
  buildReturnItems,
  generateAdjustedInvoiceNumber,
  buildAdjustedInvoice,
  createReturnRequest,
  addThreadMessage,
  allowedTransitions,
  canBuyerMessage,
  canAdminRespond,
  RETURN_REASON_LABELS,
  demoReturnRequests,
} from "../returns";
import {
  generateAIResponse,
  createChatSession,
  processUserMessage,
  matchFAQ,
} from "../ai-chat";
import {
  notifications,
  notifyOrderStatus,
  notifyReturnStatus,
} from "../notifications";

// ============================================================================
// RETURNS & REFUNDS TESTS
// ============================================================================

describe("calculateRefund", () => {
  it("calculates correct refund for single item", () => {
    const items = [
      { productId: "p1", productName: "Tomato", originalQty: 10, returnQty: 5, unitPrice: 44, unit: "kg" as const },
    ];
    const result = calculateRefund(items);
    expect(result).toBe(220); // 5 * 44
  });

  it("calculates correct refund for multiple items", () => {
    const items = [
      { productId: "p1", productName: "Tomato", originalQty: 10, returnQty: 5, unitPrice: 44, unit: "kg" as const },
      { productId: "p2", productName: "Onion", originalQty: 20, returnQty: 3, unitPrice: 32, unit: "kg" as const },
    ];
    const result = calculateRefund(items);
    expect(result).toBe(316); // 5*44 + 3*32
  });

  it("returns zero for empty items", () => {
    expect(calculateRefund([])).toBe(0);
  });

  it("returns zero when returnQty is zero", () => {
    const items = [
      { productId: "p1", productName: "Tomato", originalQty: 10, returnQty: 0, unitPrice: 44, unit: "kg" as const },
    ];
    expect(calculateRefund(items)).toBe(0);
  });
});

describe("buildReturnItems", () => {
  const orderItems = [
    { productId: "p1", name: "Tomato", qty: 10, price: 44, unit: "kg" as const },
    { productId: "p2", name: "Onion", qty: 20, price: 32, unit: "kg" as const },
  ];

  it("builds return items with quantities", () => {
    const result = buildReturnItems(orderItems, { p1: 5, p2: 0 });
    expect(result).toHaveLength(1);
    expect(result[0].returnQty).toBe(5);
    expect(result[0].lineRefund).toBe(220);
  });

  it("ignores zero return quantities", () => {
    const result = buildReturnItems(orderItems, { p1: 0, p2: 0 });
    expect(result).toHaveLength(0);
  });

  it("clamps return qty to original qty", () => {
    const result = buildReturnItems(orderItems, { p1: 15 }); // > 10 original
    expect(result[0].returnQty).toBe(10);
    expect(result[0].lineRefund).toBe(440);
  });
});

describe("generateAdjustedInvoiceNumber", () => {
  it("generates correct format", () => {
    expect(generateAdjustedInvoiceNumber("INV-001", 1)).toBe("INV-001-ADJ01");
    expect(generateAdjustedInvoiceNumber("INV-001", 10)).toBe("INV-001-ADJ10");
    expect(generateAdjustedInvoiceNumber("INV-001", 99)).toBe("INV-001-ADJ99");
  });
});

describe("buildAdjustedInvoice", () => {
  it("calculates correct new total", () => {
    const returnReq = {
      ...demoReturnRequests[0],
      totalRefund: 220,
    };
    const result = buildAdjustedInvoice("INV-ORIGINAL", 1000, returnReq, 1);
    
    expect(result.originalInvoiceNumber).toBe("INV-ORIGINAL");
    expect(result.refundTotal).toBe(220);
    expect(result.newTotal).toBe(780); // 1000 - 220
    expect(result.adjustedInvoiceNumber).toBe("INV-ORIGINAL-ADJ01");
  });
});

describe("createReturnRequest", () => {
  it("creates return request with correct structure", () => {
    const input = {
      orderId: "order-test",
      orderNumber: "ORD-TEST-001",
      buyerId: "buyer-test",
      businessName: "Test Store",
      buyerPhone: "+91 98765 43210",
      items: [
        { productId: "p1", productName: "Tomato", originalQty: 10, returnQty: 3, unitPrice: 44, unit: "kg" as const },
      ],
      reason: "DAMAGED" as const,
      notes: "Test",
      images: [],
    };

    const result = createReturnRequest(input);

    expect(result.id).toMatch(/^RET-\d+-\d+$/);
    expect(result.status).toBe("REQUESTED");
    expect(result.totalRefund).toBe(132); // 3 * 44
    expect(result.thread).toHaveLength(1);
    expect(result.thread[0].sender).toBe("system");
    expect(result.images).toEqual([]);
  });

  it("initializes thread with system message", () => {
    const input = {
      orderId: "order-test",
      orderNumber: "ORD-TEST-001",
      buyerId: "buyer-test",
      businessName: "Test Store",
      buyerPhone: "+91 98765 43210",
      items: [],
      reason: "OTHER" as const,
      notes: "",
      images: [],
    };

    const result = createReturnRequest(input);
    expect(result.thread[0].sender).toBe("system");
    expect(result.thread[0].text).toContain("ORD-TEST-001");
    expect(result.thread[0].text).toContain("REQUESTED");
  });
});

describe("addThreadMessage", () => {
  it("adds message to thread", () => {
    const returnReq = createReturnRequest({
      orderId: "order-1",
      orderNumber: "ORD-001",
      buyerId: "buyer-1",
      businessName: "Test",
      buyerPhone: "+91 98765 43210",
      items: [],
      reason: "OTHER",
      notes: "",
      images: [],
    });

    const msg = addThreadMessage(returnReq, "buyer", "Help!");
    
    expect(returnReq.thread).toHaveLength(2);
    expect(msg.sender).toBe("buyer");
    expect(msg.text).toBe("Help!");
  });
});

describe("allowedTransitions", () => {
  it("REQUESTED can go to APPROVED or REJECTED", () => {
    expect(allowedTransitions("REQUESTED")).toContain("APPROVED");
    expect(allowedTransitions("REQUESTED")).toContain("REJECTED");
  });

  it("APPROVED can only go to PICKED_UP", () => {
    expect(allowedTransitions("APPROVED")).toEqual(["PICKED_UP"]);
  });

  it("REJECTED and COMPLETED have no transitions", () => {
    expect(allowedTransitions("REJECTED")).toHaveLength(0);
    expect(allowedTransitions("COMPLETED")).toHaveLength(0);
  });

  it("REFUNDED can go to COMPLETED", () => {
    expect(allowedTransitions("REFUNDED")).toEqual(["COMPLETED"]);
  });
});

describe("canBuyerMessage", () => {
  it("allows messaging for active statuses", () => {
    expect(canBuyerMessage("REQUESTED")).toBe(true);
    expect(canBuyerMessage("APPROVED")).toBe(true);
    expect(canBuyerMessage("PICKED_UP")).toBe(true);
    expect(canBuyerMessage("REFUNDED")).toBe(true);
  });

  it("blocks messaging for terminal statuses", () => {
    expect(canBuyerMessage("COMPLETED")).toBe(false);
    expect(canBuyerMessage("REJECTED")).toBe(false);
  });
});

describe("RETURN_REASON_LABELS", () => {
  it("has all required reasons", () => {
    expect(RETURN_REASON_LABELS.DAMAGED).toBe("Damaged in transit");
    expect(RETURN_REASON_LABELS.SPOILED).toBe("Spoiled / Not fresh");
    expect(RETURN_REASON_LABELS.WRONG_ITEM).toBe("Wrong item delivered");
    expect(RETURN_REASON_LABELS.QUALITY_ISSUE).toBe("Quality not as expected");
    expect(RETURN_REASON_LABELS.NOT_AS_DESCRIBED).toBe("Not as described");
    expect(RETURN_REASON_LABELS.OTHER).toBe("Other reason");
  });
});

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

describe("notifyReturnStatus", () => {
  it("does not throw for placeholder implementation", async () => {
    await expect(
      notifyReturnStatus(
        { userId: "test", email: "test@test.com", phone: "+919876543210" },
        "RETURN_APPROVED"
      )
    ).resolves.not.toThrow();
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe("Full Return Lifecycle", () => {
  it("completes full return flow from request to completion", () => {
    // Step 1: Create return request
    const returnReq = createReturnRequest({
      orderId: "order-1",
      orderNumber: "ORD-001",
      buyerId: "buyer-1",
      businessName: "Test Store",
      buyerPhone: "+91 98765 43210",
      items: [
        { productId: "p1", productName: "Tomato", originalQty: 10, returnQty: 5, unitPrice: 44, unit: "kg" as const },
      ],
      reason: "DAMAGED",
      notes: "Items damaged",
      images: [],
    });

    expect(returnReq.status).toBe("REQUESTED");
    expect(canBuyerMessage(returnReq.status)).toBe(true);
    expect(allowedTransitions(returnReq.status)).toContain("APPROVED");

    // Step 2: Admin approves
    returnReq.status = "APPROVED";
    addThreadMessage(returnReq, "admin", "Your return has been approved.");
    expect(returnReq.thread).toHaveLength(2);
    expect(canBuyerMessage(returnReq.status)).toBe(true);

    // Step 3: Pickup
    returnReq.status = "PICKED_UP";
    expect(allowedTransitions(returnReq.status)).toContain("REFUNDED");

    // Step 4: Refund processed
    returnReq.status = "REFUNDED";
    addThreadMessage(returnReq, "system", "Refund of Rs. 220 has been processed.");
    expect(returnReq.totalRefund).toBe(220);

    // Step 5: Complete
    returnReq.status = "COMPLETED";
    expect(canBuyerMessage(returnReq.status)).toBe(false);
    expect(allowedTransitions(returnReq.status)).toHaveLength(0);
  });
});
