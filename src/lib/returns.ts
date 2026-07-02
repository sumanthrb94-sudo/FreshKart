/** Returns, Refunds & Invoice Adjustment System for FreshKart.
 *  Handles partial/full returns, refund calculations, and invoice re-generation.
 */

export type ReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";
export type ReturnReason =
  | "DAMAGED"
  | "SPOILED"
  | "WRONG_ITEM"
  | "QUALITY_ISSUE"
  | "OVER_ORDERED"
  | "OTHER";

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  DAMAGED: "Damaged in transit",
  SPOILED: "Spoiled / Not fresh",
  WRONG_ITEM: "Wrong item delivered",
  QUALITY_ISSUE: "Quality not as expected",
  OVER_ORDERED: "Over-ordered",
  OTHER: "Other reason",
};

export interface ReturnItem {
  productId: string;
  productName: string;
  originalQty: number;
  returnQty: number;
  unitPrice: number;
  unit: string;
  lineRefund: number;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  businessName: string;
  items: ReturnItem[];
  status: ReturnStatus;
  reason: ReturnReason;
  notes?: string;
  requestedAt: string;
  resolvedAt?: string;
  totalRefund: number;
  adjustedInvoiceNumber: string;
}

/** Calculate refund amount for a set of returned items. */
export function calculateRefund(items: Omit<ReturnItem, "lineRefund">[]): number {
  return items.reduce((sum, item) => {
    const lineRefund = item.returnQty * item.unitPrice;
    return sum + lineRefund;
  }, 0);
}

/** Generate return items from an order's items with return quantities. */
export function buildReturnItems(
  orderItems: { productId: string; name: string; qty: number; price: number; unit: string }[],
  returnQuantities: Record<string, number>
): ReturnItem[] {
  return orderItems
    .map((item) => {
      const returnQty = returnQuantities[item.productId] || 0;
      if (returnQty <= 0) return null;
      return {
        productId: item.productId,
        productName: item.name,
        originalQty: item.qty,
        returnQty: Math.min(returnQty, item.qty),
        unitPrice: item.price,
        unit: item.unit,
        lineRefund: Math.min(returnQty, item.qty) * item.price,
      };
    })
    .filter(Boolean) as ReturnItem[];
}

/** Generate adjusted invoice number after return. */
export function generateAdjustedInvoiceNumber(
  originalInvoiceNumber: string,
  adjustmentCount: number
): string {
  return `${originalInvoiceNumber}-ADJ${String(adjustmentCount).padStart(2, "0")}`;
}

/** Build an adjusted invoice reflecting the return. */
export interface AdjustedInvoice {
  originalInvoiceNumber: string;
  adjustedInvoiceNumber: string;
  adjustedAt: string;
  originalTotal: number;
  refundTotal: number;
  newTotal: number;
  returnedItems: ReturnItem[];
  notes: string;
}

export function buildAdjustedInvoice(
  originalInvoiceNumber: string,
  originalTotal: number,
  returnRequest: ReturnRequest,
  adjustmentCount: number
): AdjustedInvoice {
  return {
    originalInvoiceNumber,
    adjustedInvoiceNumber: generateAdjustedInvoiceNumber(originalInvoiceNumber, adjustmentCount),
    adjustedAt: new Date().toISOString(),
    originalTotal,
    refundTotal: returnRequest.totalRefund,
    newTotal: originalTotal - returnRequest.totalRefund,
    returnedItems: returnRequest.items,
    notes: `Adjusted after return #${returnRequest.id}. Reason: ${RETURN_REASON_LABELS[returnRequest.reason]}.`,
  };
}

// Demo return requests
export const demoReturnRequests: ReturnRequest[] = [
  {
    id: "RET-20260701-001",
    orderId: "order-1",
    orderNumber: "ORD-20260620-7HK2Q2",
    businessName: "Suresh Kirana Store",
    items: [
      { productId: "p-tomato", productName: "Tomato", originalQty: 40, returnQty: 5, unitPrice: 44, unit: "kg", lineRefund: 220 },
    ],
    status: "APPROVED",
    reason: "QUALITY_ISSUE",
    notes: "Some tomatoes were overripe",
    requestedAt: "2026-06-21T10:00:00.000Z",
    resolvedAt: "2026-06-21T14:00:00.000Z",
    totalRefund: 220,
    adjustedInvoiceNumber: "INV-20260620-7HK2Q2-ADJ01",
  },
];
