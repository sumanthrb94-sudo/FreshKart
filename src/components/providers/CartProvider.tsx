"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CartLine, Product, StoredCartLine } from "@/lib/types";
import { calculateDeliveryFee } from "@/lib/delivery";
import { useAuth } from "./AuthProvider";
import { api } from "@/lib/api";

interface CartContextValue {
  lines: CartLine[];
  /** distinct products in the cart */
  itemCount: number;
  /** total quantity across all lines (used for whole-order minimum) */
  totalQty: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  qtyOf: (productId: string) => number;
  /** Adds one minOrderQty step (or first step if not present). */
  add: (product: Product) => void;
  increment: (product: Product) => void;
  /** Steps down by minOrderQty; removes the line when it drops below MOQ. */
  decrement: (product: Product) => void;
  setQty: (product: Product, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function clampStep(product: Product, qty: number): number {
  const step = product.minOrderQty;
  // snap to a multiple of the step, within [step, stock]
  let q = Math.round(qty / step) * step;
  if (q < step) q = 0;
  const cap = Math.floor(product.stock / step) * step;
  if (q > cap) q = cap;
  return q;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, updateProfile } = useAuth();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const lastUid = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cart lives ONLY in this account's own Firestore doc (users/{uid}.cart) —
  // never in localStorage. Re-hydrate whenever the signed-in account changes
  // (sign-in, sign-out, or switching accounts on the same device/browser) so
  // two accounts on the same device can never see each other's cart.
  useEffect(() => {
    const uid = user?.id ?? null;
    if (uid === lastUid.current) return;
    lastUid.current = uid;
    setHydrated(false);

    if (!uid) {
      setLines([]);
      setHydrated(true);
      return;
    }

    const stored: StoredCartLine[] = user?.cart ?? [];
    if (!stored.length) {
      setLines([]);
      setHydrated(true);
      return;
    }

    let cancelled = false;
    api
      .listProducts()
      .then((products) => {
        if (cancelled) return;
        const byId = new Map(products.map((p) => [p.id, p]));
        const restored: CartLine[] = [];
        for (const s of stored) {
          const product = byId.get(s.productId);
          if (product) restored.push({ product, qty: s.qty });
        }
        setLines(restored);
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          setLines([]);
          setHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Persist to this account's Firestore doc (debounced) whenever the cart
  // changes post-hydration.
  const uid = user?.id ?? null;
  useEffect(() => {
    if (!hydrated || !uid) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const payload: StoredCartLine[] = lines.map((l) => ({
        productId: l.product.id,
        qty: l.qty,
      }));
      updateProfile({ cart: payload }).catch(() => {});
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, hydrated, uid]);

  const setProductQty = useCallback((product: Product, qty: number) => {
    setLines((prev) => {
      const next = clampStep(product, qty);
      const idx = prev.findIndex((l) => l.product.id === product.id);
      if (next <= 0) {
        return idx === -1 ? prev : prev.filter((l) => l.product.id !== product.id);
      }
      if (idx === -1) return [...prev, { product, qty: next }];
      const copy = [...prev];
      // refresh the stored product snapshot (price/stock may have changed)
      copy[idx] = { product, qty: next };
      return copy;
    });
  }, []);

  const qtyOf = useCallback(
    (productId: string) => lines.find((l) => l.product.id === productId)?.qty ?? 0,
    [lines]
  );

  const add = useCallback(
    (product: Product) => setProductQty(product, qtyOf(product.id) + product.minOrderQty),
    [setProductQty, qtyOf]
  );
  const increment = add;
  const decrement = useCallback(
    (product: Product) =>
      setProductQty(product, qtyOf(product.id) - product.minOrderQty),
    [setProductQty, qtyOf]
  );

  const remove = useCallback(
    (productId: string) => setLines((prev) => prev.filter((l) => l.product.id !== productId)),
    []
  );
  const clear = useCallback(() => setLines([]), []);

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.product.price * l.qty, 0),
    [lines]
  );
  const totalQty = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines]);
  const deliveryFee = useMemo(() => calculateDeliveryFee(subtotal), [subtotal]);
  const total = useMemo(() => subtotal + deliveryFee, [subtotal, deliveryFee]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      itemCount: lines.length,
      totalQty,
      subtotal,
      deliveryFee,
      total,
      qtyOf,
      add,
      increment,
      decrement,
      setQty: setProductQty,
      remove,
      clear,
    }),
    [lines, totalQty, subtotal, deliveryFee, total, qtyOf, add, increment, decrement, setProductQty, remove, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}
