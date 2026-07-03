"use client";

import { useState, useCallback } from "react";
import { Tag, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { findCouponByCode, validateCoupon } from "@/lib/coupons";
import type { Coupon, AppliedCoupon } from "@/lib/coupons";
import { toast } from "@/lib/toast";

interface CouponInputProps {
  orderTotal: number;
  onApply: (applied: AppliedCoupon | null) => void;
  categoryIds?: string[];
  productIds?: string[];
}

export function CouponInput({ orderTotal, onApply, categoryIds, productIds }: CouponInputProps) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const [loading, setLoading] = useState(false);

  const handleApply = useCallback(() => {
    if (!code.trim()) return;
    setLoading(true);

    // Simulate network delay
    setTimeout(() => {
      const coupon = findCouponByCode(code.trim());
      if (!coupon) {
        toast.error("Invalid coupon", "This coupon code does not exist");
        setLoading(false);
        return;
      }

      const result = validateCoupon(coupon, orderTotal, categoryIds, productIds);
      if (!result.valid) {
        toast.error("Cannot apply coupon", result.error || "Invalid coupon");
        setLoading(false);
        return;
      }

      const discount = result.discount || 0;
      const appliedCoupon: AppliedCoupon = {
        coupon,
        discountAmount: discount,
        originalTotal: orderTotal,
        finalTotal: orderTotal - discount,
      };

      setApplied(appliedCoupon);
      onApply(appliedCoupon);
      toast.success("Coupon applied!", `Saved ${formatCurrency(discount)} with ${coupon.code}`);
      setLoading(false);
    }, 400);
  }, [code, orderTotal, onApply, categoryIds, productIds]);

  const handleRemove = () => {
    setApplied(null);
    setCode("");
    onApply(null);
    toast.info("Coupon removed", "Applied coupon has been removed");
  };

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-emerald-500" />
          <div>
            <p className="text-sm font-bold text-emerald-700">{applied.coupon.code}</p>
            <p className="text-[11px] text-emerald-600">
              -{formatCurrency(applied.discountAmount)} saved
            </p>
          </div>
        </div>
        <button
          onClick={handleRemove}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-500/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2">
      <Tag className="h-4 w-4 shrink-0 text-fg-subtle" />
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === "Enter" && handleApply()}
        placeholder="Enter coupon code"
        className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
      />
      <button
        onClick={handleApply}
        disabled={!code.trim() || loading}
        className={cn(
          "flex h-7 items-center gap-1 rounded-lg px-3 text-xs font-bold transition-all",
          code.trim() && !loading
            ? "bg-brand-500 text-white hover:bg-brand-600"
            : "bg-line text-fg-subtle"
        )}
      >
        {loading ? (
          "..."
        ) : (
          <>
            <Check className="h-3 w-3" /> Apply
          </>
        )}
      </button>
    </div>
  );
}
