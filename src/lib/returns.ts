/** Returns, Refunds & Invoice Adjustment System for Green Basket.
 *  Handles partial/full returns, refund calculations, image uploads,
 *  threaded conversations, and invoice re-generation.
 */

export type ReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "PICKED_UP" | "REFUNDED" | "COMPLETED";
export type ReturnReason =
  | "DAMAGED"
  | "SPOILED"
  | "WRONG_ITEM"
  | "QUALITY_ISSUE"
  | "OVER_ORDERED"
  | "NOT_AS_DESCRIBED"
  | "OTHER";

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  DAMAGED: "Damaged in transit",
  SPOILED: "Spoiled / Not fresh",
  WRONG_ITEM: "Wrong item delivered",
  QUALITY_ISSUE: "Quality not as expected",
  OVER_ORDERED: "Over-ordered",
  NOT_AS_DESCRIBED: "Not as described",
  OTHER: "Other reason",
};

export interface ReturnImage {
  id: string;
  url: string;
  filename: string;
  uploadedAt: string;
}

export interface ReturnMessage {
  id: string;
  sender: "buyer" | "admin" | "system";
  text: string;
  images?: ReturnImage[];
  sentAt: string;
}

export interface ReturnItem {
  productId: string;
  productName: string;
  originalQty: number;
  returnQty: number;
  unitPrice: number;
  unit: string;
  lineRefund: number;
  images?: ReturnImage[];
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  buyerId: string;
  businessName: string;
  buyerPhone: string;
  items: ReturnItem[];
  status: ReturnStatus;
  reason: ReturnReason;
  notes?: string;
  requestedAt: string;
  resolvedAt?: string;
  totalRefund: number;
  adjustedInvoiceNumber: string;
  images: ReturnImage[];
  thread: ReturnMessage[];
  adminNotes?: string;
  pickupScheduledAt?: string;
  refundTransactionId?: string;
  updatedAt?: string;
}

export interface CreateReturnInput {
  orderId: string;
  orderNumber: string;
  buyerId: string;
  businessName: string;
  buyerPhone: string;
  items: Omit<ReturnItem, "lineRefund">[];
  reason: ReturnReason;
  notes?: string;
  images: ReturnImage[];
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

/** Create a new return request with thread initialization. */
export function createReturnRequest(input: CreateReturnInput): ReturnRequest {
  const id = `RET-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const items = input.items.map((item) => ({
    ...item,
    lineRefund: item.returnQty * item.unitPrice,
  }));
  const totalRefund = items.reduce((sum, item) => sum + item.lineRefund, 0);
  
  const systemMessage: ReturnMessage = {
    id: `msg-${Date.now()}-sys`,
    sender: "system",
    text: `Return request ${id} created for order ${input.orderNumber}. Status: REQUESTED. Reason: ${RETURN_REASON_LABELS[input.reason]}. Estimated refund: Rs. ${totalRefund}.`,
    sentAt: new Date().toISOString(),
  };

  return {
    id,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    buyerId: input.buyerId,
    businessName: input.businessName,
    buyerPhone: input.buyerPhone,
    items,
    status: "REQUESTED",
    reason: input.reason,
    notes: input.notes,
    requestedAt: new Date().toISOString(),
    totalRefund,
    adjustedInvoiceNumber: generateAdjustedInvoiceNumber(`INV-${input.orderNumber}`, 1),
    images: input.images,
    thread: [systemMessage],
  };
}

/** Add a message to a return thread. */
export function addThreadMessage(
  returnReq: ReturnRequest,
  sender: "buyer" | "admin" | "system",
  text: string,
  images?: ReturnImage[]
): ReturnMessage {
  const message: ReturnMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sender,
    text,
    images,
    sentAt: new Date().toISOString(),
  };
  returnReq.thread.push(message);
  return message;
}

/** Status transition helper — returns the allowed next statuses. */
export function allowedTransitions(status: ReturnStatus): ReturnStatus[] {
  const transitions: Record<ReturnStatus, ReturnStatus[]> = {
    REQUESTED: ["APPROVED", "REJECTED"],
    APPROVED: ["PICKED_UP"],
    REJECTED: [],
    PICKED_UP: ["REFUNDED"],
    REFUNDED: ["COMPLETED"],
    COMPLETED: [],
  };
  return transitions[status] || [];
}

/** Check if buyer can add messages (only when status is active). */
export function canBuyerMessage(status: ReturnStatus): boolean {
  return status !== "COMPLETED" && status !== "REJECTED";
}

/** Check if admin can respond to a return. */
export function canAdminRespond(status: ReturnStatus): boolean {
  return status !== "COMPLETED" && status !== "REJECTED";
}

// Demo return requests with threads
export const demoReturnRequests: ReturnRequest[] = [
  {
    id: "RET-20260701-001",
    orderId: "order-1",
    orderNumber: "ORD-20260620-7HK2Q2",
    buyerId: "user-demo-1",
    businessName: "Suresh Kirana Store",
    buyerPhone: "+91 98765 43210",
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
    images: [
      { id: "img-1", url: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400", filename: "tomato-damage-1.jpg", uploadedAt: "2026-06-21T10:05:00.000Z" },
    ],
    thread: [
      { id: "msg-1", sender: "system", text: "Return request RET-20260701-001 created for order ORD-20260620-7HK2Q2. Status: REQUESTED. Reason: Quality not as expected. Estimated refund: Rs. 220.", sentAt: "2026-06-21T10:00:00.000Z" },
      { id: "msg-2", sender: "buyer", text: "The tomatoes were overripe and some had started rotting. I have attached photos. Please arrange pickup.", sentAt: "2026-06-21T10:05:00.000Z" },
      { id: "msg-3", sender: "admin", text: "Thank you for reporting this. We have approved your return request. Our pickup executive will contact you within 24 hours. Refund of Rs. 220 will be processed after pickup confirmation.", sentAt: "2026-06-21T14:00:00.000Z" },
    ],
    adminNotes: "Quality confirmed from photos. Approve refund.",
  },
  {
    id: "RET-20260702-002",
    orderId: "order-2",
    orderNumber: "ORD-20260622-9KL4M5",
    buyerId: "user-demo-2",
    businessName: "Priya Restaurant",
    buyerPhone: "+91 98765 12345",
    items: [
      { productId: "p-onion", productName: "Onion", originalQty: 25, returnQty: 3, unitPrice: 32, unit: "kg", lineRefund: 96 },
    ],
    status: "REQUESTED",
    reason: "DAMAGED",
    notes: "Outer layers damaged during transport",
    requestedAt: "2026-07-02T08:30:00.000Z",
    totalRefund: 96,
    adjustedInvoiceNumber: "INV-20260622-9KL4M5-ADJ01",
    images: [
      { id: "img-2", url: "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400", filename: "onion-damage.jpg", uploadedAt: "2026-07-02T08:35:00.000Z" },
    ],
    thread: [
      { id: "msg-4", sender: "system", text: "Return request RET-20260702-002 created for order ORD-20260622-9KL4M5. Status: REQUESTED. Reason: Damaged in transit. Estimated refund: Rs. 96.", sentAt: "2026-07-02T08:30:00.000Z" },
      { id: "msg-5", sender: "buyer", text: "3 kg of onions have damaged outer layers. The inner parts are usable but I am requesting partial return for the damaged quantity.", sentAt: "2026-07-02T08:35:00.000Z" },
    ],
  },
];
