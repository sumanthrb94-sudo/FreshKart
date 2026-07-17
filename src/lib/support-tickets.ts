/** General buyer support tickets — the persisted, human-escalatable home for
 *  the AI chat widget. Mirrors the returns thread system (returns.ts): a
 *  buyer owns a thread of messages, an explicit status locks it when done,
 *  and admins get full read/reply/close access.
 */

export type TicketStatus = "OPEN" | "CLOSED";
export type TicketSender = "buyer" | "admin" | "assistant" | "system";

export interface TicketMessage {
  id: string;
  sender: TicketSender;
  text: string;
  sentAt: string;
  /** Quick-reply chips shown under this message — only ever set on the most
   *  recent assistant message, persisted so a reopened chat renders exactly
   *  as it looked live. */
  suggestions?: string[];
}

export interface SupportTicket {
  id: string;
  buyerId: string;
  businessName: string;
  buyerPhone: string;
  status: TicketStatus;
  /** True once the buyer has asked for a human — surfaces the ticket in the
   *  admin "needs attention" view. Cleared when an admin replies. */
  needsHuman: boolean;
  thread: TicketMessage[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface CreateSupportTicketInput {
  buyerId: string;
  businessName: string;
  buyerPhone: string;
  /** Used to personalize the seed greeting message. */
  buyerName?: string;
}

export function greetingFor(name?: string): string {
  return name
    ? `Hello ${name}! I am Green Basket Assistant. I can help you with orders, returns, delivery, payments, and store policies. What can I help you with today?`
    : "Hello! I am Green Basket Assistant. I can help you with orders, returns, delivery, payments, and store policies. What can I help you with today?";
}

export const DEFAULT_SUGGESTIONS = [
  "Track my order",
  "How do returns work?",
  "Store hours",
  "Payment methods",
  "Contact support",
];

/** Buyer-triggered "talk to human" quick-reply — special-cased by the UI to
 *  escalate instead of running through the FAQ matcher. */
export const TALK_TO_HUMAN = "Talk to human";

/** Build a fresh ticket seeded with the assistant greeting. */
export function openNewTicket(input: CreateSupportTicketInput): SupportTicket {
  const now = new Date().toISOString();
  const greeting: TicketMessage = {
    id: `msg-${Date.now()}-greeting`,
    sender: "assistant",
    text: greetingFor(input.buyerName),
    sentAt: now,
    suggestions: DEFAULT_SUGGESTIONS,
  };
  return {
    id: "", // set by the backend adapter (Firestore doc id / mock id)
    buyerId: input.buyerId,
    businessName: input.businessName,
    buyerPhone: input.buyerPhone,
    status: "OPEN",
    needsHuman: false,
    thread: [greeting],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildTicketMessage(
  sender: TicketSender,
  text: string,
  suggestions?: string[]
): TicketMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sender,
    text,
    sentAt: new Date().toISOString(),
    ...(suggestions ? { suggestions } : {}),
  };
}

export const ESCALATION_NOTICE =
  "You've been connected to our support team. A team member will reply here shortly — you can also tap Call Now for immediate help.";

/** Buyer may add messages / escalate only while the ticket is open. */
export function canBuyerMessage(status: TicketStatus): boolean {
  return status === "OPEN";
}

/** Admin may reply only while the ticket is open. */
export function canAdminRespond(status: TicketStatus): boolean {
  return status === "OPEN";
}
