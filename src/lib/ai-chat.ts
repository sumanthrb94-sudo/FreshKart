/** AI Chat Agent for Green Basket - Order Help & FAQ
 *  Provides intelligent responses for order tracking, returns, refunds,
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
  context?: "general" | "order_help" | "returns" | "pricing" | "technical";
}

const FAQ_RESPONSES: Record<string, string> = {
  "hours": "Our store is open from 9:00 AM to 10:00 PM IST, seven days a week. Prices are updated daily at 7:00 AM before opening.",
  "open": "We are open 9:00 AM - 10:00 PM IST daily. If you are seeing a closed message, we will be back at 9:00 AM tomorrow!",
  "close": "We close at 10:00 PM IST. Last order acceptance is at 9:30 PM for next-day delivery.",
  "closing": "We close at 10:00 PM IST. Last order acceptance is at 9:30 PM for next-day delivery.",
  "delivery": "We deliver fresh produce directly to your business location. Delivery is typically next-day for orders placed before 6:00 PM.",
  "deliver": "We deliver fresh produce directly to your business location. Delivery is typically next-day for orders placed before 6:00 PM.",
  "shipping": "Orders placed before 6:00 PM are delivered the next business day. Orders after 6:00 PM are delivered the following day.",
  "ship": "Orders placed before 6:00 PM are delivered the next business day. Orders after 6:00 PM are delivered the following day.",
  "minimum": "The minimum order quantity is 1 kg for most items. Cauliflower is sold per piece (1 unit).",
  "min": "The minimum order quantity is 1 kg for most items. Cauliflower is sold per piece (1 unit).",
  "cancel": "You can cancel your order from the order tracking screen while it is in PENDING status. Once confirmed, cancellation requires contacting support.",
  "return": "To start a return, go to your order and tap Request Return. You can upload photos of damaged items and our team will respond within 24 hours.",
  "refund": "Refunds are processed within 3-5 business days after the returned items are picked up. The refund amount is credited to your original payment method.",
  "payment": "We accept online payments via Razorpay (UPI, Cards, Net Banking), Cash on Delivery, and Credit for verified business accounts.",
  "pay": "We accept online payments via Razorpay (UPI, Cards, Net Banking), Cash on Delivery, and Credit for verified business accounts.",
  "upi": "UPI payments are accepted via Razorpay. You can pay using any UPI app: GPay, PhonePe, Paytm, or any BHIM UPI app.",
  "invoice": "You can download your invoice from the order details screen. Tap Download Invoice to get a printable PDF.",
  "contact": "Need to talk? Tap the Call Now button anywhere in the app to reach our customer service team directly.",
  "call": "Tap the green Call Now button to speak with our customer service team. We are available during store hours (9 AM - 10 PM).",
  "whatsapp": "You can reach us on WhatsApp at +91-98765-43210 for quick queries and order updates.",
  "quality": "All our produce is sourced fresh daily from local farms. If you receive items that do not meet quality standards, please initiate a return with photos.",
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

const GREETING = "Hello! I am Green Basket Assistant. I can help you with orders, returns, delivery, payments, and store policies. What can I help you with today?";

const FOLLOW_UP_SUGGESTIONS = [
  "Track my order",
  "How do returns work?",
  "Store hours",
  "Payment methods",
  "Contact support",
];

/** Simple keyword matcher for FAQ responses */
function matchFAQ(input: string): string | null {
  const lower = input.toLowerCase();

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
  if (lower.includes("how") && lower.includes("get")) {
    return "I can help you with that! Try asking about orders, returns, delivery, or tap the Call Now button to speak with our team.";
  }
  if (lower.includes("track") || lower.includes("where") || lower.includes("status")) {
    return "You can track your order in real-time from the Orders screen. Tap any order to see its current status: Placed, Confirmed, Packed, Out for Delivery, or Delivered.";
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
  const faqMatch = matchFAQ(userMessage);
  if (faqMatch) {
    return { text: faqMatch, suggestions: FOLLOW_UP_SUGGESTIONS };
  }

  if (context === "order_help") {
    return {
      text: "For order-specific help, please go to your Orders screen and tap on the order you need help with. You can also initiate a return from there if needed. Is there something specific about your order I can help with?",
      suggestions: ["How to track", "Cancel order", "Request return", "Download invoice"],
    };
  }

  if (context === "returns") {
    return {
      text: "Our return process is simple: 1) Go to your order, 2) Tap Request Return, 3) Select items and upload photos, 4) Our team reviews within 24 hours, 5) Pickup is arranged, 6) Refund processed in 3-5 days. Do you want to start a return?",
      suggestions: ["Start a return", "Refund timeline", "What items can I return", "Talk to human"],
    };
  }

  return {
    text: "I understand you are asking about \"" + userMessage + "\". For the most accurate assistance, please tap the Call Now button to speak with our customer service team, or rephrase your question and I will do my best to help!",
    suggestions: FOLLOW_UP_SUGGESTIONS,
  };
}

/** Initialize a new chat session */
export function createChatSession(): ChatSession {
  return {
    id: `chat-${Date.now()}`,
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
  if (lower.includes("return") || lower.includes("refund")) session.context = "returns";
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
  { label: "Return Item", query: "How do returns work?" },
  { label: "Store Hours", query: "What are your store hours?" },
  { label: "Call Support", query: "How do I contact support?" },
];
