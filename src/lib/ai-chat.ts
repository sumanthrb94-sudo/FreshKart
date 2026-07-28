/** AI Chat Agent for Green Basket - Order Help & FAQ
 *  Provides intelligent responses for order tracking, doorstep checks,
 *  store policies, and basic product inquiries.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
  suggestions?: string[];
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  startedAt: string;
  context?: "general" | "order_help" | "doorstep" | "pricing" | "technical";
}

const FAQ_RESPONSES: Record<string, string> = {
  "hours": "Our store is open from 9:00 AM to 10:00 PM IST, seven days a week. Prices are updated daily at 7:00 AM before opening.",
  "open": "We are open 8:00 AM - 9:00 PM IST daily. The cart closes at 9:00 PM — orders after that go to the next day's delivery run.",
  "close": "We close at 10:00 PM IST. Last order acceptance is at 9:30 PM for next-day delivery.",
  "closing": "We close at 10:00 PM IST. Last order acceptance is at 9:30 PM for next-day delivery.",
  "delivery": "We deliver fresh produce directly to your business location. Delivery is typically next-day for orders placed before 6:00 PM.",
  "deliver": "We deliver fresh produce directly to your business location. Delivery is typically next-day for orders placed before 6:00 PM.",
  "shipping": "Orders placed before 6:00 PM are delivered the next business day. Orders after 6:00 PM are delivered the following day.",
  "ship": "Orders placed before 6:00 PM are delivered the next business day. Orders after 6:00 PM are delivered the following day.",
  "minimum": "The minimum order quantity is 1 kg for most items. Cauliflower is sold per piece (1 unit).",
  "min": "The minimum order quantity is 1 kg for most items. Cauliflower is sold per piece (1 unit).",
  "cancel": "You can cancel your order from the order tracking screen while it is in PENDING status. Once confirmed, cancellation requires contacting support.",
  "return": "Check the produce with our driver before you accept it. Anything you are not happy with, hand straight back — the driver records it there and then, the bill drops, and you pay only for what you keep. There is no pickup or return after the driver leaves.",
  "refund": "Nothing is refunded later because nothing is overcharged first: refuse what you do not want at the door and the driver reprints the amount before collecting. Your invoice shows the deduction and the reason.",
  "payment": "We accept online payments via Razorpay (UPI, Cards, Net Banking) and Cash on Delivery.",
  "pay": "We accept online payments via Razorpay (UPI, Cards, Net Banking) and Cash on Delivery.",
  "upi": "UPI payments are accepted via Razorpay. You can pay using any UPI app: GPay, PhonePe, Paytm, or any BHIM UPI app.",
  "invoice": "You can download your invoice from the order details screen. Tap Download Invoice to get a printable PDF.",
  "contact": "Need to talk? Tap the Call Now button anywhere in the app to reach our customer service team directly.",
  "call": "Tap the green Call Now button to speak with our customer service team. We are available during store hours (9 AM - 10 PM).",
  "whatsapp": "You can reach us on WhatsApp at +91 74166 20691 for quick queries and order updates.",
  "quality": "All our produce is sourced fresh daily from local farms. Inspect it while the driver is with you — anything below standard goes back on the spot and comes off the bill.",
  "fresh": "We source directly from farms every morning. Produce is quality-checked before packing and dispatched in temperature-controlled vehicles.",
  "account": "You can update your business profile from the Profile screen. Tap your name in the header to access account settings.",
  "password": "To reset your password, sign out and use the Forgot Password option on the login screen. A reset link will be sent to your email.",
  "register": "New users can register by providing business name, email, phone, and city. Approval is instant for B2B buyers.",
  "sign up": "New users can register by providing business name, email, phone, and city. Approval is instant for B2B buyers.",
  "privacy": "We take your privacy seriously. Your data is encrypted and never shared with third parties. Read our full Privacy Policy at fresh-kart-six.vercel.app/privacy",
  "gst": "GST invoices are auto-generated for all orders. Your GSTIN can be added in your profile settings.",
  "bulk": "For bulk orders above 500 kg, please contact our sales team via Call Now for special wholesale pricing.",
  "price": "Prices are updated daily at 7:00 AM based on market rates. All prices shown are current and include any applicable taxes.",
  "cost": "Prices are updated daily at 7:00 AM based on market rates. All prices shown are current and include any applicable taxes.",
  "language": "The app supports multiple languages. Language selection will be available in your profile settings soon.",
  "lang": "The app supports multiple languages. Language selection will be available in your profile settings soon.",
};

const GREETING = "Hello! I am Green Basket Assistant. I can help you with orders, delivery, payments, and store policies. What can I help you with today?";

const FOLLOW_UP_SUGGESTIONS = [
  "Track my order",
  "What if produce is bad?",
  "Store hours",
  "Payment methods",
  "Contact support",
];

/** Answers to a recognisable topic — these outrank everything else. */
function matchTopic(lower: string): string | null {
  for (const [keyword, response] of Object.entries(FAQ_RESPONSES)) {
    if (lower.includes(keyword)) {
      return response;
    }
  }

  // Multi-word patterns
  if (lower.includes("how do") && lower.includes("return")) {
    return FAQ_RESPONSES["return"];
  }
  if (lower.includes("how do") && lower.includes("cancel")) {
    return FAQ_RESPONSES["cancel"];
  }
  if (lower.includes("how") && lower.includes("pay")) {
    return FAQ_RESPONSES["payment"];
  }
  if (lower.includes("track") || lower.includes("where") || lower.includes("status")) {
    return "You can track your order in real-time from the Orders screen. Tap any order to see its current status: Placed, Confirmed, Packed, Out for Delivery, or Delivered.";
  }

  return null;
}

/**
 * Small talk and vague asks for help. Kept apart from the topic answers
 * because they match very loosely — "help with my order" contains "help" —
 * and must not drown out what the conversation is already about.
 */
function matchConversational(lower: string): string | null {
  if (lower.includes("how") && lower.includes("get")) {
    return "I can help you with that! Try asking about orders, delivery, or tap the Call Now button to speak with our team.";
  }
  if (lower.includes("help") || lower.includes("support") || lower.includes("issue")) {
    return "I am here to help! For urgent issues, tap the Call Now button to speak directly with our team. You can also describe your issue here and I will assist you.";
  }
  if (lower.includes("thank")) {
    return "You are welcome! I am glad I could help. Have a great day and happy shopping with Green Basket!";
  }
  if (lower.includes("bye") || lower.includes("goodbye")) {
    return "Goodbye! Feel free to come back anytime you need assistance. Green Basket is here for you 24/7!";
  }

  return null;
}

/** Generate AI response for user input */
export function generateAIResponse(userMessage: string, context?: ChatSession["context"]): { text: string; suggestions?: string[] } {
  const lower = userMessage.toLowerCase();
  const topic = matchTopic(lower);
  if (topic) {
    return { text: topic, suggestions: FOLLOW_UP_SUGGESTIONS };
  }

  if (context === "order_help") {
    return {
      text: "For order-specific help, please go to your Orders screen and tap on the order you need help with. Is there something specific about your order I can help with?",
      suggestions: ["How to track", "Cancel order", "What if produce is bad?", "Download invoice"],
    };
  }

  if (context === "doorstep") {
    return {
      text: "Everything is settled at your door: 1) The driver opens the delivery, 2) You check the produce, 3) You hand back anything you do not want, 4) The driver photographs it and records the deduction, 5) You pay the reduced amount. Once the driver leaves, the order is closed — so please check before you accept.",
      suggestions: ["What if produce is bad?", "Download invoice", "How to track", "Talk to human"],
    };
  }

  const chat = matchConversational(lower);
  if (chat) {
    return { text: chat, suggestions: FOLLOW_UP_SUGGESTIONS };
  }

  return {
    text: "I understand you are asking about \"" + userMessage + "\". For the most accurate assistance, please tap the Call Now button to speak with our customer service team, or rephrase your question and I will do my best to help!",
    suggestions: FOLLOW_UP_SUGGESTIONS,
  };
}

/** Initialize a new chat session */
export function createChatSession(): ChatSession {
  // Random suffix (matches the id idiom used elsewhere, e.g. buildTicketMessage)
  // so two sessions created within the same millisecond can't collide.
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    context: "general",
    messages: [
      {
        id: `msg-${Date.now()}-greeting`,
        role: "assistant",
        text: GREETING,
        timestamp: new Date().toISOString(),
        suggestions: FOLLOW_UP_SUGGESTIONS,
      },
    ],
  };
}

/** Add user message and generate AI response */
export function processUserMessage(
  session: ChatSession,
  text: string
): { updatedSession: ChatSession; aiResponse: ChatMessage } {
  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}-user`,
    role: "user",
    text,
    timestamp: new Date().toISOString(),
  };

  const lower = text.toLowerCase();
  if (lower.includes("return") || lower.includes("refund")) session.context = "doorstep";
  else if (lower.includes("order") || lower.includes("track")) session.context = "order_help";
  else if (lower.includes("price") || lower.includes("cost")) session.context = "pricing";

  const { text: aiText, suggestions } = generateAIResponse(text, session.context);

  const aiMsg: ChatMessage = {
    id: `msg-${Date.now()}-ai`,
    role: "assistant",
    text: aiText,
    timestamp: new Date().toISOString(),
    suggestions,
  };

  session.messages.push(userMsg, aiMsg);

  return { updatedSession: session, aiResponse: aiMsg };
}

/** Quick action prompts */
export const QUICK_ACTIONS = [
  { label: "Track Order", query: "How do I track my order?" },
  { label: "Bad Produce", query: "What if produce is bad?" },
  { label: "Store Hours", query: "What are your store hours?" },
  { label: "Call Support", query: "How do I contact support?" },
];
