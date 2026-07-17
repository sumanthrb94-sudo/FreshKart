import type { DailyPricesSettings, Order, Product, User } from "@/lib/types";
import { ORDERS, PRODUCTS, USERS, DEMO_PASSWORD } from "@/lib/mock-data";
import type { ReturnRequest } from "@/lib/returns";
import { demoReturnRequests } from "@/lib/returns";
import type { SupportTicket } from "@/lib/support-tickets";

interface MockStore {
  products: Product[];
  users: User[];
  orders: Order[];
  returns: ReturnRequest[];
  supportTickets: SupportTicket[];
  dailyPrices: DailyPricesSettings | null;
  credentials: Record<string, string>;
}

const LS_KEY = "green_basket_mock_store_v1";

function seed(): MockStore {
  return {
    products: structuredClone(PRODUCTS),
    users: structuredClone(USERS),
    orders: structuredClone(ORDERS),
    returns: structuredClone(demoReturnRequests),
    supportTickets: [],
    dailyPrices: null,
    credentials: {
      "customer@green-basket.in": DEMO_PASSWORD,
      "admin@green-basket.in": DEMO_PASSWORD,
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
    if (!parsed.returns) parsed.returns = seed().returns;
    if (!parsed.supportTickets) parsed.supportTickets = [];
    if (!parsed.credentials) parsed.credentials = seed().credentials;
    if (!parsed.products || parsed.products.length === 0) parsed.products = seed().products;
    if (!parsed.users || parsed.users.length === 0) parsed.users = seed().users;
    if (parsed.dailyPrices === undefined) parsed.dailyPrices = null;
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

// The `notify()` above only reaches listeners registered in THIS tab's JS
// realm — admin and buyer are always different tabs/devices in practice, so
// without this, one side's mutation (e.g. an admin processing a refund)
// would never reach the other's subscribeOrders/subscribeReturns callbacks.
// The browser's `storage` event fires in every OTHER same-origin tab
// whenever localStorage changes (never the tab that made the change), so
// this is exactly the cross-tab signal needed: reload from localStorage and
// re-notify this tab's own listeners.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== LS_KEY) return;
    _state = load();
    notify();
  });
}

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
