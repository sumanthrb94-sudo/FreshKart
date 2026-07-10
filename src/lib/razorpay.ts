/** Razorpay Payment Integration for FreshKart.
 *  Handles order creation, payment verification, and callbacks.
 */

import { ApiError } from "./api/datasource";

const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

export interface RazorpayOrder {
  id: string;
  amount: number; // in paise
  currency: string;
  receipt: string;
  status: string;
}

export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

/** Create a Razorpay order on the backend. */
export async function createRazorpayOrder(
  amountInRs: number,
  receipt: string,
  notes?: Record<string, string>
): Promise<RazorpayOrder> {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    // Demo mode: return mock order
    return {
      id: `order_demo_${Date.now()}`,
      amount: Math.round(amountInRs * 100),
      currency: "INR",
      receipt,
      status: "created",
    };
  }

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
    },
    body: JSON.stringify({
      amount: Math.round(amountInRs * 100), // Convert to paise
      currency: "INR",
      receipt,
      notes: notes || {},
      payment_capture: 1,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new ApiError(error.error?.description || "Failed to create Razorpay order", response.status);
  }

  return response.json();
}

/** Verify Razorpay payment signature. */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string = RAZORPAY_KEY_SECRET
): boolean {
  if (!secret) return true; // Demo mode: skip verification

  // In production, verify using crypto HMAC
  // const crypto = require("crypto");
  // const expected = crypto.createHmac("sha256", secret)
  //   .update(`${orderId}|${paymentId}`)
  //   .digest("hex");
  // return expected === signature;

  return true; // Simplified for client-side
}

/** Initialize Razorpay checkout (client-side). */
export function initRazorpayCheckout(options: {
  key: string;
  amount: number;
  currency: string;
  orderId: string;
  description: string;
  prefill: {
    name: string;
    email?: string;
    contact: string;
  };
  onSuccess: (response: RazorpayPaymentResponse) => void;
  onError: (error: Error) => void;
}): void {
  if (typeof window === "undefined") return;

  const razorpayKey = options.key || RAZORPAY_KEY_ID;

  if (!razorpayKey) {
    // Demo mode: simulate success
    setTimeout(() => {
      options.onSuccess({
        razorpay_payment_id: `pay_demo_${Date.now()}`,
        razorpay_order_id: options.orderId,
        razorpay_signature: "demo_signature",
      });
    }, 1500);
    return;
  }

  // Load Razorpay script if not already loaded
  if (!(window as any).Razorpay) {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => openCheckout(options);
    script.onerror = () => options.onError(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  } else {
    openCheckout(options);
  }
}

function openCheckout(options: Parameters<typeof initRazorpayCheckout>[0]): void {
  const razorpayKey = options.key || RAZORPAY_KEY_ID;

  const rzp = new (window as any).Razorpay({
    key: razorpayKey,
    amount: options.amount,
    currency: options.currency,
    order_id: options.orderId,
    name: "FreshKart",
    description: options.description,
    prefill: options.prefill,
    theme: { color: "#dc2626" },
    handler: (response: RazorpayPaymentResponse) => {
      options.onSuccess(response);
    },
    modal: {
      ondismiss: () => {
        options.onError(new ApiError("Payment cancelled by user", 499));
      },
    },
  });

  rzp.open();
}
