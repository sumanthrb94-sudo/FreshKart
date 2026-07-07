import type { Order, Product, User } from "@/lib/types";
import { inventoryProducts } from "@/lib/produce";

interface MockStore {
  products: Product[];
  users: User[];
  orders: Order[];
  credentials: Record<string, string>;
}

const LS_KEY = "freshkart_mock_store_v1";

function seed(): MockStore {
  return {
    products: inventoryProducts.map((p, i) => ({
      ...p,
      id: `prod-${i + 1}`,
      stock: 500,
      minOrderQty: 10,
    })),
    users: [
      {
        id: "admin-1",
        name: "FreshKart Admin",
        email: "sumanthbolla97@gmail.com",
        phone: "9876543210",
        role: "ADMIN",
        businessName: "FreshKart Admin",
        city: "Bangalore",
        createdAt: new Date().toISOString(),
      },
      {
        id: "buyer-1",
        name: "Demo Buyer",
        email: "demo@freshkart.in",
        phone: "9876543211",
        role: "BUYER",
        businessName: "Shree Sai Restaurant",
        businessType: "Restaurant",
        address: "12th Main, Koramangala",
        city: "Bangalore",
        pincode: "560034",
        createdAt: new Date().toISOString(),
      },
    ],
    orders: [],
    credentials: {
      "sumanthbolla97@gmail.com": "admin123",
      "demo@freshkart.in": "demo123",
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
