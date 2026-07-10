"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CartLine, Product } from "@/lib/types";

const CART_KEY = "green-basket.cart.v1";

interface StoredLine {
  product: Product;
  qty: number;
}

interface CartContextValue {
  lines: CartLine[];
  /** distinct products in the cart */
  itemCount: number;
  subtotal: number;
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
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      if (raw) setLines(JSON.parse(raw) as StoredLine[]);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines, hydrated]);

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

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      itemCount: lines.length,
      subtotal,
      qtyOf,
      add,
      increment,
      decrement,
      setQty: setProductQty,
      remove,
      clear,
    }),
    [lines, subtotal, qtyOf, add, increment, decrement, setProductQty, remove, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}
