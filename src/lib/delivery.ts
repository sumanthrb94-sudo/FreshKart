/**
 * Delivery fee slab based on order subtotal (in rupees).
 *
 * - ₹0     – ₹1,000  → ₹75
 * - ₹1,001 – ₹3,000  → ₹50
 * - Above ₹3,000     → FREE
 */
export function calculateDeliveryFee(subtotal: number): number {
  if (subtotal <= 0) return 0;
  if (subtotal <= 1000) return 75;
  if (subtotal <= 3000) return 50;
  return 0;
}
