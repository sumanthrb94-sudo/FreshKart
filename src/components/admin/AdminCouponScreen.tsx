"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Tag, Percent, IndianRupee, Copy, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  getCoupons,
  saveCoupon,
  deleteCoupon,
  generateCouponCode,
  DEMO_COUPONS,
} from "@/lib/coupons";
import type { Coupon, DiscountType } from "@/lib/coupons";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

function useCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  useEffect(() => {
    // Safe client-side only initialization
    try {
      const existing = getCoupons();
      if (existing.length === 0) {
        DEMO_COUPONS.forEach(saveCoupon);
        setCoupons(DEMO_COUPONS);
      } else {
        setCoupons(existing);
      }
    } catch {
      // Fallback if localStorage is unavailable
      setCoupons(DEMO_COUPONS);
    }
  }, []);

  const refresh = useCallback(() => {
    try {
      setCoupons(getCoupons());
    } catch {
      setCoupons(DEMO_COUPONS);
    }
  }, []);

  return { coupons, refresh };
}

export function AdminCouponScreen() {
  const { coupons, refresh } = useCoupons();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [description, setDescription] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => {
    setCode("");
    setDiscountType("percentage");
    setDiscountValue("");
    setMinOrder("");
    setMaxDiscount("");
    setDescription("");
    setValidFrom("");
    setValidUntil("");
    setUsageLimit("");
    setIsActive(true);
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (coupon: Coupon) => {
    setEditing(coupon);
    setCode(coupon.code);
    setDiscountType(coupon.discountType);
    setDiscountValue(String(coupon.discountValue));
    setMinOrder(String(coupon.minOrderAmount));
    setMaxDiscount(String(coupon.maxDiscount));
    setDescription(coupon.description);
    setValidFrom(coupon.validFrom.slice(0, 10));
    setValidUntil(coupon.validUntil.slice(0, 10));
    setUsageLimit(String(coupon.usageLimit));
    setIsActive(coupon.isActive);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!code.trim() || !discountValue || !validUntil) {
      toast.error("Required fields missing", "Code, discount value, and expiry date are required");
      return;
    }

    const coupon: Coupon = {
      id: editing?.id || `coupon-${Date.now()}`,
      code: code.trim().toUpperCase(),
      discountType,
      discountValue: Number(discountValue),
      minOrderAmount: Number(minOrder) || 0,
      maxDiscount: Number(maxDiscount) || Number(discountValue),
      description: description || `${discountType === "percentage" ? discountValue + "%" : "Rs. " + discountValue} off`,
      validFrom: validFrom ? new Date(validFrom).toISOString() : new Date().toISOString(),
      validUntil: new Date(validUntil).toISOString(),
      usageLimit: Number(usageLimit) || 0,
      usageCount: editing?.usageCount || 0,
      isActive,
      createdBy: "admin",
      createdAt: editing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveCoupon(coupon);
    refresh();
    resetForm();
    toast.success(editing ? "Coupon updated!" : "Coupon created!", `Code: ${coupon.code}`);
  };

  const handleDelete = (id: string, code: string) => {
    if (confirm(`Delete coupon ${code}?`)) {
      deleteCoupon(id);
      refresh();
      toast.success("Coupon deleted", code);
    }
  };

  const handleToggleActive = (coupon: Coupon) => {
    const updated = { ...coupon, isActive: !coupon.isActive, updatedAt: new Date().toISOString() };
    saveCoupon(updated);
    refresh();
    toast.success(updated.isActive ? "Coupon activated" : "Coupon deactivated", coupon.code);
  };

  const filtered = coupons.filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-fg">Coupons</h1>
            <p className="text-xs text-fg-subtle">Create and manage promo codes</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setCode(generateCouponCode());
              setShowForm(true);
            }}
            leadingIcon={<Plus className="h-4 w-4" />}
          >
            New Coupon
          </Button>
        </div>

        <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3">
          <Search className="h-4 w-4 text-fg-subtle" />
          <input
            type="text"
            placeholder="Search coupons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 flex-1 bg-transparent text-sm text-fg outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Create/Edit Form */}
        {showForm && (
          <Card>
            <CardBody className="p-4 space-y-3">
              <h3 className="text-sm font-bold text-fg">
                {editing ? "Edit Coupon" : "Create New Coupon"}
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-subtle">Coupon Code</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="FRESH50"
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-subtle">Discount Type</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDiscountType("percentage")}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium",
                        discountType === "percentage"
                          ? "border-brand-500 bg-brand-500/10 text-brand-500"
                          : "border-line bg-surface text-fg-muted"
                      )}
                    >
                      <Percent className="h-3 w-3" /> Percentage
                    </button>
                    <button
                      onClick={() => setDiscountType("flat")}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium",
                        discountType === "flat"
                          ? "border-brand-500 bg-brand-500/10 text-brand-500"
                          : "border-line bg-surface text-fg-muted"
                      )}
                    >
                      <IndianRupee className="h-3 w-3" /> Flat
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-subtle">
                    {discountType === "percentage" ? "Discount %" : "Flat Amount (Rs.)"}
                  </label>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === "percentage" ? "50" : "100"}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-subtle">Min Order (Rs.)</label>
                  <input
                    type="number"
                    value={minOrder}
                    onChange={(e) => setMinOrder(e.target.value)}
                    placeholder="500"
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-subtle">Max Discount (Rs.)</label>
                  <input
                    type="number"
                    value={maxDiscount}
                    onChange={(e) => setMaxDiscount(e.target.value)}
                    placeholder="200"
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-fg-subtle">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="50% off on orders above Rs. 500"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-subtle">Valid From</label>
                  <input
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-subtle">Valid Until</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-subtle">Usage Limit (0=unlimited)</label>
                  <input
                    type="number"
                    value={usageLimit}
                    onChange={(e) => setUsageLimit(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium",
                    isActive
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-red-500/10 text-red-600"
                  )}
                >
                  {isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                  {isActive ? "Active" : "Inactive"}
                </button>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSubmit}>
                  {editing ? "Update Coupon" : "Create Coupon"}
                </Button>
                <Button size="sm" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Coupon List */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Tag className="h-12 w-12 text-fg-subtle" />
            <p className="mt-3 text-base font-bold text-fg">No coupons found</p>
          </div>
        ) : (
          filtered.map((c) => (
            <Card
              key={c.id}
              className={cn(
                "transition-all",
                !c.isActive && "opacity-60"
              )}
            >
              <CardBody className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                        {c.discountType === "percentage" ? `${c.discountValue}%` : formatCurrency(c.discountValue)} OFF
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold",
                          c.isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
                        )}
                      >
                        {c.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <p className="text-lg font-mono font-bold text-fg">{c.code}</p>
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(c.code).catch(() => {});
                          toast.success("Copied!", c.code, 1500);
                        }}
                        className="text-fg-subtle hover:text-brand-500"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-fg-muted">{c.description}</p>
                    <p className="mt-1 text-[10px] text-fg-subtle">
                      Min {formatCurrency(c.minOrderAmount)} &bull; Max discount {formatCurrency(c.maxDiscount)} &bull;{" "}
                      {c.usageLimit > 0 ? `${c.usageCount}/${c.usageLimit} used` : `${c.usageCount} used`} &bull;{" "}
                      Till {formatDate(c.validUntil)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => handleToggleActive(c)}
                      className="rounded-lg p-2 text-fg-subtle hover:bg-raised"
                      title={c.isActive ? "Deactivate" : "Activate"}
                    >
                      {c.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => startEdit(c)}
                      className="rounded-lg p-2 text-fg-subtle hover:bg-raised"
                      title="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id, c.code)}
                      className="rounded-lg p-2 text-fg-subtle hover:bg-red-500/10 hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
