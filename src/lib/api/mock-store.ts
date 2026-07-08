import type { Order, Product, User } from "@/lib/types";
import { PRODUCTS, USERS, DEMO_PASSWORD } from "@/lib/mock-data";

interface MockStore {
  products: Product[];
  users: User[];
  orders: Order[];
  credentials: Record<string, string>;
}

const LS_KEY = "freshkart_mock_store_v1";

function seed(): MockStore {
  return {
    products: PRODUCTS.map((p) => ({ ...p })),
    users: USERS.map((u) => ({ ...u })),
    orders: [],
    credentials: {
      "customer@freshkart.in": DEMO_PASSWORD,
      "admin@freshkart.in": DEMO_PASSWORD,
      "anita@spiceleaf.in": DEMO_PASSWORD,
      "mohan@dailyfresh.in": DEMO_PASSWORD,
    },
  };
}

function load(): MockStore {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as MockStore;
    // Ensure all required fields exist (migration from older store versions)
    if (!parsed.orders) parsed.orders = [];
    if (!parsed.credentials) parsed.credentials = seed().credentials;
    if (!parsed.products || parsed.products.length === 0) parsed.products = seed().products;
    if (!parsed.users || parsed.users.length === 0) parsed.users = seed().users;
    return parsed;
  } catch {
    return seed();
  }
}

function persist(s: MockStore) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }
}

/** Simple pub/sub for real-time mock subscriptions */
type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore listener errors
    }
  });
}

let _state = load();

export const store = {
  get(): MockStore {
    return _state;
  },
  mutate(fn: (s: MockStore) => void) {
    fn(_state);
    persist(_state);
    notify();
  },
  /** Subscribe to any store mutation. Used by mock real-time subscriptions. */
  subscribe(cb: Listener): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  /** Reset everything (useful for testing). */
  reset() {
    _state = seed();
    persist(_state);
    notify();
  },
};
