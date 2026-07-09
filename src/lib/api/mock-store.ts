import type { DailyPricesSettings, Order, Product, User } from "@/lib/types";
import { ORDERS, PRODUCTS, USERS } from "@/lib/mock-data";

/**
 * Mutable in-memory store for the mock backend, persisted to localStorage so a
 * demo session survives reloads. On the server (no `window`) it falls back to
 * fresh seed data each call — fine for the mock, and irrelevant once a real
 * backend is wired in.
 */
const KEY = "freshkart.store.v1";

interface StoreShape {
  products: Product[];
  orders: Order[];
  users: User[];
  dailyPrices: DailyPricesSettings | null;
}

function seed(): StoreShape {
  return {
    products: structuredClone(PRODUCTS),
    orders: structuredClone(ORDERS),
    users: structuredClone(USERS),
    dailyPrices: null,
  };
}

let memory: StoreShape | null = null;

function load(): StoreShape {
  if (memory) return memory;
  if (typeof window === "undefined") {
    memory = seed();
    return memory;
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      memory = JSON.parse(raw) as StoreShape;
      return memory;
    }
  } catch {
    // ignore corrupt storage and reseed
  }
  memory = seed();
  persist();
  return memory;
}

function persist() {
  if (typeof window === "undefined" || !memory) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // storage full / unavailable — keep working from memory
  }
}

export const store = {
  get(): StoreShape {
    return load();
  },
  mutate(fn: (s: StoreShape) => void) {
    const s = load();
    fn(s);
    persist();
  },
  /** Wipe persisted demo state (used by a "reset demo" affordance if needed). */
  reset() {
    memory = seed();
    persist();
  },
};
