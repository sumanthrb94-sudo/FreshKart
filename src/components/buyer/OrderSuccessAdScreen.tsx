"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Copy, Tag, Percent, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "@/components/buyer/BuyerHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useOrderTracker } from "@/components/providers/OrderTrackerProvider";
import type { Order } from "@/lib/types";

interface Coupon {
  id: string;
  code: string;
  discountType: "percentage" | "flat";
  discountValue: number;
  minOrderAmount: number;
  maxDiscount: number;
  description: string;
  validUntil: string;
  usageCount: number;
  isActive: boolean;
}

const demoCoupons: Coupon[] = [
  {
    id: "c1",
    code: "FRESH50",
    discountType: "percentage",
    discountValue: 50,
    minOrderAmount: 500,
    maxDiscount: 200,
    description: "50% off on orders above Rs. 500",
    validUntil: "2026-07-31",
    usageCount: 128,
    isActive: true,
  },
  {
    id: "c2",
    code: "WELCOME100",
    discountType: "flat",
    discountValue: 100,
    minOrderAmount: 300,
    maxDiscount: 100,
    description: "Rs. 100 off on your first order above Rs. 300",
    validUntil: "2026-12-31",
    usageCount: 342,
    isActive: true,
  },
  {
    id: "c3",
    code: "BULKDEAL",
    discountType: "percentage",
    discountValue: 20,
    minOrderAmount: 2000,
    maxDiscount: 500,
    description: "20% off on bulk orders above Rs. 2000",
    validUntil: "2026-08-15",
    usageCount: 56,
    isActive: true,
  },
];

function getSavedCoupons(): Coupon[] {
  try {
    const stored = localStorage.getItem("freshkart_coupons");
    if (stored) return JSON.parse(stored);
    localStorage.setItem("freshkart_coupons", JSON.stringify(demoCoupons));
    return demoCoupons;
  } catch {
    return demoCoupons;
  }
}

export function OrderSuccessAdScreen({
  orderId,
  orderNumber,
  total,
}: {
  orderId: string;
  orderNumber: string;
  total: number;
}) {
  const router = useRouter();
  const { startTracking } = useOrderTracker();
  const [coupons, setCoupons] = useState<Coupon[]>(demoCoupons);
  const [copiedCode, setCopiedCode] = useState("");
  const [showAds] = useState(true);

  // Start tracking this order on mount
  useEffect(() => {
    setCoupons(getSavedCoupons());

    // Build a mock Order object and start real-time tracking
    const mockOrder: Order = {
      id: orderId,
      orderNumber,
      buyerId: "demo-buyer",
      businessName: "Demo Business",
      items: [
        {
          productId: "p1",
          name: "Tomato",
          unit: "kg",
          price: 25,
          qty: 10,
          lineTotal: 250,
        },
        {
          productId: "p2",
          name: "Onion",
          unit: "kg",
          price: 30,
          qty: 5,
          lineTotal: 150,
        },
      ],
      status: "PENDING",
      paymentMethod: "COD",
      paymentStatus: "UNPAID",
      subtotal: total,
      deliveryFee: 0,
      total,
      delivery: {
        name: "Demo Buyer",
        phone: "+919876543210",
        city: "Bangalore",
        address: "123 Main Street",
        pincode: "560001",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    startTracking(mockOrder);
  }, [orderId, orderNumber, total, startTracking]);

  const activeCoupons = coupons.filter((c) => c.isActive && new Date(c.validUntil) > new Date());

  const handleCopyCode = useCallback((code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    toast.success("Coupon copied!", `Code ${code} copied to clipboard`, 2000);
    setTimeout(() => setCopiedCode(""), 2000);
  }, []);

  return (
    <AppShell header={<BuyerHeader />}>
      <div className="flex flex-col gap-3 p-4">
        {/* Order Success Header */}
        <div className="flex flex-col items-center py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h1 className="mt-3 text-xl font-extrabold text-fg">Order Placed!</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {orderNumber} &bull; {formatCurrency(total)}
          </p>
          <p className="mt-1 text-xs text-fg-subtle">
            Your order will be delivered tomorrow. Track it below.
          </p>
        </div>

        {/* Order Actions */}
        <div className="flex flex-col gap-2">
          <Button fullWidth onClick={() => router.push(`/orders/${orderId}`)}>
            Track Order
          </Button>
          <Button variant="outline" fullWidth onClick={() => router.push("/orders")}>
            View All Orders
          </Button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 py-2">
          <div className="h-px flex-1 bg-line" />
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-xs font-bold text-accent">EXCLUSIVE OFFERS FOR YOU</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        {/* Ad Banner */}
        {showAds && (
          <Card className="overflow-hidden border-accent/30">
            <div className="bg-gradient-to-r from-brand-500 to-emerald-600 px-4 py-3">
              <p className="text-sm font-bold text-white">Order again tomorrow &amp; save more!</p>
              <p className="text-[11px] text-white/80">Fresh produce delivered daily to your business.</p>
            </div>
            <CardBody className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
                  <Tag className="h-5 w-5 text-brand-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-fg">Daily Fresh Guarantee</p>
                  <p className="text-xs text-fg-subtle">Farm-to-business in 24 hours</p>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Coupon Cards */}
        <h2 className="text-sm font-bold text-fg">Available Coupons</h2>
        <div className="flex flex-col gap-2.5">
          {activeCoupons.map((coupon) => (
            <Card
              key={coupon.id}
              className="overflow-hidden border-dashed border-accent/40 transition-all hover:border-accent"
            >
              <CardBody className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                        {coupon.discountType === "percentage" ? (
                          <span className="flex items-center gap-0.5"><Percent className="h-3 w-3" />{coupon.discountValue}% OFF</span>
                        ) : (
                          <span>{formatCurrency(coupon.discountValue)} OFF</span>
                        )}
                      </span>
                      <span className="text-[10px] text-fg-subtle">
                        Min {formatCurrency(coupon.minOrderAmount)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-fg">{coupon.code}</p>
                    <p className="text-xs text-fg-muted">{coupon.description}</p>
                    <p className="mt-1 text-[10px] text-fg-subtle">
                      Valid till {new Date(coupon.validUntil).toLocaleDateString()} &bull; {coupon.usageCount} used
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyCode(coupon.code)}
                    leadingIcon={<Copy className="h-3 w-3" />}
                  >
                    {copiedCode === coupon.code ? "Copied" : "Copy"}
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Referral Ad */}
        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
          <CardBody className="p-4 text-center">
            <p className="text-sm font-bold text-amber-800">Refer a Business Friend</p>
            <p className="mt-1 text-xs text-amber-700">
              Share FreshKart with other businesses and earn rewards on their first order!
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 border-amber-300 text-amber-800 hover:bg-amber-100"
              onClick={() => {
                navigator.clipboard?.writeText("https://fresh-kart-six.vercel.app").catch(() => {});
                toast.success("Link copied!", "Share it with your business friends", 2000);
              }}
            >
              <Copy className="mr-1 h-3 w-3" /> Copy Referral Link
            </Button>
          </CardBody>
        </Card>

        {/* Back to shop */}
        <Button variant="ghost" fullWidth onClick={() => router.push("/")} className="mt-2">
          <ArrowLeft className="mr-1 h-4 w-4" /> Continue Shopping
        </Button>
      </div>
    </AppShell>
  );
}
