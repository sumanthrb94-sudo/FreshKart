/** Coupon / Promo Code System for FreshKart
 *  Admin-only CRUD for coupons. Customers apply at checkout.
 */

export type DiscountType = "percentage" | "flat";

export interface Coupon {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number; // percentage (0-100) or flat amount in INR
  minOrderAmount: number;
  maxDiscount: number; // cap for percentage coupons
  description: string;
  validFrom: string;
  validUntil: string;
  usageLimit: number; // 0 = unlimited
  usageCount: number;
  isActive: boolean;
  createdBy: string; // admin user id
  createdAt: string;
  updatedAt: string;
  applicableCategories?: string[]; // empty = all
  applicableProducts?: string[]; // empty = all
}

export interface AppliedCoupon {
  coupon: Coupon;
  discountAmount: number;
  originalTotal: number;
  finalTotal: number;
}

/** Validate a coupon against an order total */
export function validateCoupon(
  coupon: Coupon | undefined,
  orderTotal: number,
  categoryIds: string[] = [],
  productIds: string[] = []
): { valid: boolean; error?: string; discount?: number } {
  if (!coupon) return { valid: false, error: "Invalid coupon code" };

  if (!coupon.isActive) return { valid: false, error: "This coupon is not active" };

  const now = new Date();
  if (new Date(coupon.validFrom) > now) return { valid: false, error: "Coupon not yet valid" };
  if (new Date(coupon.validUntil) < now) return { valid: false, error: "Coupon has expired" };

  if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, error: "Coupon usage limit reached" };
  }

  if (orderTotal < coupon.minOrderAmount) {
    return { valid: false, error: `Minimum order amount is ${formatRs(coupon.minOrderAmount)}` };
  }

  // Category restriction
  if (coupon.applicableCategories && coupon.applicableCategories.length > 0) {
    const hasMatch = categoryIds.some((c) => coupon.applicableCategories!.includes(c));
    if (!hasMatch) return { valid: false, error: "Coupon not applicable for these items" };
  }

  // Product restriction
  if (coupon.applicableProducts && coupon.applicableProducts.length > 0) {
    const hasMatch = productIds.some((p) => coupon.applicableProducts!.includes(p));
    if (!hasMatch) return { valid: false, error: "Coupon not applicable for these items" };
  }

  // Calculate discount
  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = (orderTotal * coupon.discountValue) / 100;
    discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = Math.min(coupon.discountValue, orderTotal);
  }

  return { valid: true, discount: Math.round(discount) };
}

/** Apply coupon to order and return result */
export function applyCoupon(
  coupon: Coupon,
  orderTotal: number,
  categoryIds?: string[],
  productIds?: string[]
): AppliedCoupon | null {
  const result = validateCoupon(coupon, orderTotal, categoryIds, productIds);
  if (!result.valid || result.discount === undefined) return null;

  return {
    coupon,
    discountAmount: result.discount,
    originalTotal: orderTotal,
    finalTotal: orderTotal - result.discount,
  };
}

/** Generate a random coupon code */
export function generateCouponCode(prefix = "FRESH"): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = prefix;
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Format rupee amount */
function formatRs(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-IN")}`;
}

/** Save coupon to localStorage */
export function saveCoupon(coupon: Coupon): void {
  const existing = getCoupons();
  const idx = existing.findIndex((c) => c.id === coupon.id);
  if (idx >= 0) {
    existing[idx] = { ...coupon, updatedAt: new Date().toISOString() };
  } else {
    existing.push(coupon);
  }
  localStorage.setItem("freshkart_coupons", JSON.stringify(existing));
}

/** Get all coupons from localStorage */
export function getCoupons(): Coupon[] {
  try {
    return JSON.parse(localStorage.getItem("freshkart_coupons") || "[]");
  } catch {
    return [];
  }
}

/** Delete coupon */
export function deleteCoupon(id: string): void {
  const filtered = getCoupons().filter((c) => c.id !== id);
  localStorage.setItem("freshkart_coupons", JSON.stringify(filtered));
}

/** Find coupon by code (case-insensitive) */
export function findCouponByCode(code: string): Coupon | undefined {
  return getCoupons().find((c) => c.code.toUpperCase() === code.toUpperCase() && c.isActive);
}

// Demo coupons seeded on first load
export const DEMO_COUPONS: Coupon[] = [
  {
    id: "coupon-1",
    code: "FRESH50",
    discountType: "percentage",
    discountValue: 50,
    minOrderAmount: 500,
    maxDiscount: 200,
    description: "50% off on orders above Rs. 500 (max Rs. 200)",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    usageLimit: 0,
    usageCount: 128,
    isActive: true,
    createdBy: "admin",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-07-03T00:00:00Z",
  },
  {
    id: "coupon-2",
    code: "WELCOME100",
    discountType: "flat",
    discountValue: 100,
    minOrderAmount: 300,
    maxDiscount: 100,
    description: "Rs. 100 off on first order above Rs. 300",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    usageLimit: 1,
    usageCount: 342,
    isActive: true,
    createdBy: "admin",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-07-03T00:00:00Z",
  },
  {
    id: "coupon-3",
    code: "BULK20",
    discountType: "percentage",
    discountValue: 20,
    minOrderAmount: 2000,
    maxDiscount: 500,
    description: "20% off on bulk orders above Rs. 2000 (max Rs. 500)",
    validFrom: "2026-01-01",
    validUntil: "2026-08-31",
    usageLimit: 0,
    usageCount: 56,
    isActive: true,
    createdBy: "admin",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-07-03T00:00:00Z",
  },
];
