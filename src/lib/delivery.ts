/**
 * Delivery fee slab based on order subtotal (in rupees).
 *
 * - Below ₹1,000      → ₹50
 * - ₹1,000 – ₹3,000   → ₹25
 * - Above ₹3,000      → FREE
 *
 * MUST stay in lockstep with getExpectedDeliveryFee() in firestore.rules.
 * The browser writes orders straight to Firestore, so the rules recompute
 * this fee and reject any order whose deliveryFee doesn't match exactly —
 * a drift between the two blocks every checkout with a bare "Missing or
 * insufficient permissions".
 */
export function calculateDeliveryFee(subtotal: number): number {
  if (subtotal <= 0) return 0;
  if (subtotal < 1000) return 50;
  if (subtotal <= 3000) return 25;
  return 0;
}
