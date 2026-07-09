import type { Category, Order, Product, User } from "./types";

/**
 * Seed content for the mock data layer. Values are the REAL catalog, demo
 * accounts and copy from the design brief (§9) — no invented prices.
 */

export const CATEGORIES: Category[] = [
  { id: "vegetables", name: "Vegetables" },
  { id: "leafy-greens", name: "Leafy Greens" },
];

type SeedProduct = Omit<Product, "id" | "active"> & {
  id?: string;
  active?: boolean;
};

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()/]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const RAW: SeedProduct[] = [
  // Vegetables — name, unit, price, minOrderQty, stock, origin
  { name: "Onion (New Red)", category: "vegetables", unit: "kg", price: 24, minOrderQty: 25, stock: 600, origin: "Kurnool, Andhra Pradesh" },
  { name: "Onion (Big)", category: "vegetables", unit: "kg", price: 25, minOrderQty: 25, stock: 480, origin: "Lasalgaon, Maharashtra" },
  { name: "Potato", category: "vegetables", unit: "kg", price: 22, minOrderQty: 25, stock: 750, origin: "Agra, Uttar Pradesh" },
  { name: "Tomato", category: "vegetables", unit: "kg", price: 44, minOrderQty: 20, stock: 320, origin: "Madanapalle, Andhra Pradesh" },
  { name: "Green Chilli", category: "vegetables", unit: "kg", price: 60, minOrderQty: 10, stock: 140, origin: "Guntur, Andhra Pradesh" },
  { name: "Chilli Bajji (Bhajji)", category: "vegetables", unit: "kg", price: 55, minOrderQty: 10, stock: 95, origin: "Guntur, Andhra Pradesh" },
  { name: "Ginger", category: "vegetables", unit: "kg", price: 135, minOrderQty: 10, stock: 80, origin: "Wayanad, Kerala" },
  { name: "Garlic", category: "vegetables", unit: "kg", price: 180, minOrderQty: 10, stock: 18, origin: "Madhya Pradesh" },
  { name: "Cabbage", category: "vegetables", unit: "kg", price: 28, minOrderQty: 20, stock: 260, origin: "Ooty, Tamil Nadu" },
  { name: "Cauliflower", category: "vegetables", unit: "pc", price: 30, minOrderQty: 10, stock: 200, origin: "Karnal, Haryana" },
  { name: "Bottle Gourd", category: "vegetables", unit: "kg", price: 28, minOrderQty: 20, stock: 150, origin: "Kolar, Karnataka" },
  { name: "Ladies Finger (Okra)", category: "vegetables", unit: "kg", price: 38, minOrderQty: 10, stock: 120, origin: "Anand, Gujarat" },
  { name: "Donda (Tindora)", category: "vegetables", unit: "kg", price: 40, minOrderQty: 10, stock: 90, origin: "Kolar, Karnataka" },
  { name: "Ridge Gourd", category: "vegetables", unit: "kg", price: 48, minOrderQty: 10, stock: 110, origin: "Kolar, Karnataka" },
  { name: "Carrot", category: "vegetables", unit: "kg", price: 48, minOrderQty: 10, stock: 220, origin: "Ooty, Tamil Nadu" },
  { name: "Capsicum", category: "vegetables", unit: "kg", price: 55, minOrderQty: 10, stock: 130, origin: "Pune, Maharashtra" },
  { name: "Brinjal (Black)", category: "vegetables", unit: "kg", price: 30, minOrderQty: 10, stock: 160, origin: "Kolar, Karnataka" },
  { name: "Brinjal (Green / White)", category: "vegetables", unit: "kg", price: 40, minOrderQty: 10, stock: 100, origin: "Kolar, Karnataka" },
  { name: "Brinjal (Purple Long)", category: "vegetables", unit: "kg", price: 40, minOrderQty: 10, stock: 105, origin: "Kolar, Karnataka" },
  { name: "Dosakai (Yellow Cucumber)", category: "vegetables", unit: "kg", price: 35, minOrderQty: 10, stock: 70, origin: "Andhra Pradesh" },
  { name: "Keera (Cucumber)", category: "vegetables", unit: "kg", price: 30, minOrderQty: 20, stock: 240, origin: "Bengaluru Rural, Karnataka" },
  { name: "Beans (French)", category: "vegetables", unit: "kg", price: 90, minOrderQty: 10, stock: 60, origin: "Kodaikanal, Tamil Nadu" },
  { name: "Broad Beans (Chikkudu)", category: "vegetables", unit: "kg", price: 90, minOrderQty: 10, stock: 16, origin: "Chittoor, Andhra Pradesh" },
  { name: "Cluster Beans (Gokar)", category: "vegetables", unit: "kg", price: 48, minOrderQty: 10, stock: 75, origin: "Kolar, Karnataka" },
  { name: "Bitter Gourd", category: "vegetables", unit: "kg", price: 45, minOrderQty: 10, stock: 85, origin: "Kolar, Karnataka" },
  { name: "Raw Banana", category: "vegetables", unit: "pc", price: 9, minOrderQty: 12, stock: 480, origin: "Theni, Tamil Nadu" },
  { name: "Raw Mango", category: "vegetables", unit: "kg", price: 50, minOrderQty: 10, stock: 90, origin: "Krishnagiri, Tamil Nadu" },
  { name: "Lemon", category: "vegetables", unit: "kg", price: 150, minOrderQty: 10, stock: 55, origin: "Vijayawada, Andhra Pradesh" },
  { name: "Beetroot", category: "vegetables", unit: "pc", price: 35, minOrderQty: 10, stock: 180, origin: "Ooty, Tamil Nadu" },
  { name: "Drumstick", category: "vegetables", unit: "kg", price: 60, minOrderQty: 10, stock: 40, origin: "Theni, Tamil Nadu" },
  { name: "Radish", category: "vegetables", unit: "kg", price: 50, minOrderQty: 10, stock: 95, origin: "Pune, Maharashtra" },

  // Leafy Greens
  { name: "Curry Leaves", category: "leafy-greens", unit: "kg", price: 60, minOrderQty: 5, stock: 40, origin: "Tamil Nadu" },
  { name: "Kothimeer (Coriander)", category: "leafy-greens", unit: "kg", price: 90, minOrderQty: 5, stock: 50, origin: "Pune, Maharashtra" },
  { name: "Pudina (Mint)", category: "leafy-greens", unit: "kg", price: 50, minOrderQty: 5, stock: 35, origin: "Pune, Maharashtra" },
  { name: "Palak (Spinach)", category: "leafy-greens", unit: "kg", price: 60, minOrderQty: 5, stock: 8, origin: "Pune, Maharashtra" },
  { name: "Gongura", category: "leafy-greens", unit: "kg", price: 50, minOrderQty: 5, stock: 30, origin: "Telangana" },
  { name: "Thotakura (Amaranth)", category: "leafy-greens", unit: "kg", price: 50, minOrderQty: 5, stock: 28, origin: "Andhra Pradesh" },
  { name: "Methi (Fenugreek)", category: "leafy-greens", unit: "kg", price: 80, minOrderQty: 5, stock: 22, origin: "Nashik, Maharashtra" },
  { name: "Spring Onion", category: "leafy-greens", unit: "kg", price: 60, minOrderQty: 5, stock: 26, origin: "Pune, Maharashtra" },
];

export const PRODUCTS: Product[] = RAW.map((p) => ({
  ...p,
  id: p.id ?? slug(p.name),
  active: p.active ?? true,
}));


export const DEMO_PASSWORD = "password123";

export const USERS: User[] = [
  {
    id: "user-buyer-1",
    name: "FreshKart Customer",
    email: "customer@freshkart.in",
    phone: "9812345678",
    role: "BUYER",
    businessName: "Suresh Kirana Store",
    city: "Bengaluru",
    address: "12, Gandhi Bazaar, Basavanagudi",
    pincode: "560004",
    gstin: "29BUYER1234A1Z9",
    createdAt: "2026-05-01T09:00:00.000Z",
  },
  {
    id: "user-admin-1",
    name: "FreshKart Admin",
    email: "admin@freshkart.in",
    phone: "9800000000",
    role: "ADMIN",
    businessName: "FreshKart",
    city: "Bengaluru",
    address: "FreshKart Ops, Whitefield",
    pincode: "560066",
    gstin: "29FRESH9876B1Z2",
    createdAt: "2026-04-01T09:00:00.000Z",
  },
  {
    id: "user-buyer-2",
    name: "Anita Reddy",
    email: "anita@spiceleaf.in",
    phone: "9844112233",
    role: "BUYER",
    businessName: "Spice Leaf Restaurant",
    city: "Hyderabad",
    address: "45, Jubilee Hills Road No. 10",
    pincode: "500033",
    gstin: "36BUYER5678C1Z3",
    createdAt: "2026-05-12T09:00:00.000Z",
  },
  {
    id: "user-buyer-3",
    name: "Mohan Lal",
    email: "mohan@dailyfresh.in",
    phone: "9700223344",
    role: "BUYER",
    businessName: "Daily Fresh Mart",
    city: "Chennai",
    address: "8, T. Nagar, Usman Road",
    pincode: "600017",
    createdAt: "2026-05-20T09:00:00.000Z",
  },
];

function item(productId: string, qty: number) {
  const p = PRODUCTS.find((x) => x.id === productId)!;
  return {
    productId: p.id,
    name: p.name,
    unit: p.unit,
    price: p.price,
    qty,
    lineTotal: p.price * qty,
  };
}

function buildOrder(
  o: Pick<Order, "id" | "orderNumber" | "buyerId" | "status" | "paymentMethod" | "createdAt"> & {
    items: { productId: string; qty: number }[];
    paid?: boolean;
    notes?: string;
  }
): Order {
  const buyer = USERS.find((u) => u.id === o.buyerId)!;
  const items = o.items.map((i) => item(i.productId, i.qty));
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    buyerId: o.buyerId,
    businessName: buyer.businessName ?? buyer.name,
    items,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paid ?? o.paymentMethod === "ONLINE" ? "PAID" : "UNPAID",
    subtotal,
    deliveryFee: 0,
    total: subtotal,
    delivery: {
      name: buyer.businessName ?? buyer.name,
      phone: buyer.phone,
      city: buyer.city ?? "",
      address: buyer.address ?? "",
      pincode: buyer.pincode ?? "",
    },
    notes: o.notes,
    createdAt: o.createdAt,
    updatedAt: o.createdAt,
  };
}

export const ORDERS: Order[] = [
  buildOrder({
    id: "order-1",
    orderNumber: "ORD-20260620-7HK2Q2",
    buyerId: "user-buyer-1",
    status: "DELIVERED",
    paymentMethod: "ONLINE",
    paid: true,
    createdAt: "2026-06-20T07:30:00.000Z",
    items: [
      { productId: "onion-new-red", qty: 50 },
      { productId: "tomato", qty: 40 },
      { productId: "potato", qty: 50 },
    ],
  }),
  buildOrder({
    id: "order-2",
    orderNumber: "ORD-20260622-AB12CD",
    buyerId: "user-buyer-1",
    status: "SHIPPED",
    paymentMethod: "COD",
    createdAt: "2026-06-22T06:10:00.000Z",
    items: [
      { productId: "kothimeer-coriander", qty: 5 },
      { productId: "palak-spinach", qty: 5 },
      { productId: "green-chilli", qty: 10 },
      { productId: "ginger", qty: 10 },
    ],
  }),
  buildOrder({
    id: "order-3",
    orderNumber: "ORD-20260623-MN44Xy",
    buyerId: "user-buyer-2",
    status: "PENDING",
    paymentMethod: "CREDIT",
    createdAt: "2026-06-23T05:45:00.000Z",
    items: [
      { productId: "carrot", qty: 20 },
      { productId: "capsicum", qty: 10 },
      { productId: "beans-french", qty: 10 },
    ],
  }),
  buildOrder({
    id: "order-4",
    orderNumber: "ORD-20260623-PP90ZZ",
    buyerId: "user-buyer-3",
    status: "CONFIRMED",
    paymentMethod: "ONLINE",
    paid: true,
    createdAt: "2026-06-23T08:20:00.000Z",
    items: [
      { productId: "potato", qty: 75 },
      { productId: "onion-big", qty: 50 },
    ],
  }),
  buildOrder({
    id: "order-5",
    orderNumber: "ORD-20260619-CC10AA",
    buyerId: "user-buyer-2",
    status: "CANCELLED",
    paymentMethod: "COD",
    createdAt: "2026-06-19T10:05:00.000Z",
    notes: "Cancelled by buyer — stock was released.",
    items: [{ productId: "lemon", qty: 10 }],
  }),
];
