import type { DailyPricesSettings, Order, Product, StoreSettings, User } from "@/lib/types";
import { ORDERS, PRODUCTS, USERS, DEMO_PASSWORD } from "@/lib/mock-data";
import type { SupportTicket } from "@/lib/support-tickets";
import type { Coupon } from "@/lib/coupons";
import { DEMO_COUPONS } from "@/lib/coupons";
import type { InAppNotification } from "@/lib/in-app-notifications";
import type { ServiceArea } from "@/lib/service-area";
import { DEFAULT_SERVICE_AREA } from "@/lib/service-area";

interface MockStore {
  products: Product[];
  users: User[];
  orders: Order[];
  supportTickets: SupportTicket[];
  coupons: Coupon[];
  notifications: InAppNotification[];
  dailyPrices: DailyPricesSettings | null;
  storeSettings: StoreSettings | null;
  serviceArea: ServiceArea | null;
  credentials: Record<string, string>;
}

function seed(): MockStore {
  return {
    products: structuredClone(PRODUCTS),
    users: structuredClone(USERS),
    orders: structuredClone(ORDERS),
    supportTickets: [],
    coupons: structuredClone(DEMO_COUPONS),
    notifications: [],
    dailyPrices: null,
    // The demo backend ships with the starter area so the driver map has a
    // hub and pincodes to draw on a fresh reload.
    serviceArea: structuredClone(DEFAULT_SERVICE_AREA),
    storeSettings: null,
    credentials: {
      "customer@green-basket.in": DEMO_PASSWORD,
      "admin@green-basket.in": DEMO_PASSWORD,
      "driver@green-basket.in": DEMO_PASSWORD,
      "anita@spiceleaf.in": DEMO_PASSWORD,
      "mohan@dailyfresh.in": DEMO_PASSWORD,
    },
  };
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

// Pure in-memory — no client storage of any kind. This is the local-dev/demo
// backend only (production always talks to real Firestore via
// FirebaseDataSource); state resets on every full page reload, and two tabs
// no longer see each other's mutations, both fine trade-offs for a dev-only
// data source.
let _state: MockStore = seed();

export const store = {
  get(): MockStore {
    return _state;
  },
  mutate(fn: (s: MockStore) => void) {
    fn(_state);
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
    notify();
  },
};
