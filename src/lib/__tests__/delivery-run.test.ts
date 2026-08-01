/**
 * The daily cycle: orders taken today ride on tomorrow morning's van.
 *
 * Reported from the live shop: a run finished the previous day was still on
 * the admin's board the next morning, showing "Run complete — 7 stops · 18/18
 * orders · ₹13,419 collected" and ageing ("23h 16m ago"), while the cash card
 * beside it correctly read ₹0 for today. A run had no delivery date, so it
 * could never be yesterday's.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import type { Order, User } from "../types";
import {
  DELIVERY_WINDOW_START_HOUR,
  deliveryDateOf,
  isOverdueRun,
  nextDeliveryDate,
  openRunKeys,
  ordersInRun,
  runDayLabel,
} from "../delivery-run";
import { openRuns, runProgress } from "../run-progress";
import { DEFAULT_SERVICE_AREA } from "../service-area";

function atIst(istWallClock: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${istWallClock}+05:30`));
}
afterEach(() => vi.useRealTimers());

const driver: User = {
  id: "drv-1",
  name: "Executive 01",
  phone: "9708513241",
  role: "DRIVER",
  createdAt: "2026-07-01T00:00:00.000Z",
} as User;

let seq = 0;
function order(over: Partial<Order> = {}): Order {
  seq += 1;
  return {
    id: `o${seq}`,
    orderNumber: `ORD-${seq}`,
    buyerId: `b${seq}`,
    businessName: `Shop ${seq}`,
    items: [],
    status: "CONFIRMED",
    paymentMethod: "COD",
    paymentStatus: "UNPAID",
    subtotal: 1000,
    deliveryFee: 0,
    total: 1000,
    delivery: {
      address: `${seq} Main Road`,
      city: "Hyderabad",
      pincode: "500048",
      phone: "9000000000",
    },
    createdAt: "2026-08-01T04:00:00.000Z",
    updatedAt: "2026-08-01T04:00:00.000Z",
    ...over,
  } as Order;
}

describe("which van an order rides on", () => {
  it("puts an order assigned during the day on tomorrow's run", () => {
    // 14:30 IST on 1 Aug — the shop is open, this morning's van is long back.
    atIst("2026-08-01T14:30:00");
    expect(nextDeliveryDate()).toBe("2026-08-02");
  });

  it("puts an order assigned after the 9 PM close on tomorrow's run", () => {
    atIst("2026-08-01T22:15:00");
    expect(nextDeliveryDate()).toBe("2026-08-02");
  });

  it("keeps packing either side of midnight on the same van", () => {
    // The office packs from 23:00 to 01:00. Splitting that by calendar date
    // would put two halves of one load on two different runs.
    atIst("2026-08-01T23:00:00");
    const late = nextDeliveryDate();
    atIst("2026-08-02T01:00:00");
    const early = nextDeliveryDate();
    expect(late).toBe("2026-08-02");
    expect(early).toBe("2026-08-02");
  });

  it("still catches this morning's van right up to departure", () => {
    atIst("2026-08-02T07:30:00");
    expect(nextDeliveryDate()).toBe("2026-08-02");
    expect(DELIVERY_WINDOW_START_HOUR).toBe(8);
  });

  it("switches to tomorrow the moment the van leaves", () => {
    atIst("2026-08-02T08:00:00");
    expect(nextDeliveryDate()).toBe("2026-08-03");
  });
});

describe("orders that predate the delivery date field", () => {
  it("falls back to the assignment time, so nothing vanishes off the board", () => {
    // Every order already assigned in the live shop has no deliveryDate.
    // Dropping them would have emptied the office's board while the driver's
    // handset still showed the stops.
    const legacy = order({
      driverId: "drv-1",
      assignedAt: "2026-07-31T16:00:00.000Z", // 21:30 IST on 31 Jul
    });
    expect(deliveryDateOf(legacy)).toBe("2026-08-01");
  });

  it("prefers the stamped date when there is one", () => {
    const stamped = order({
      driverId: "drv-1",
      assignedAt: "2026-07-31T16:00:00.000Z",
      deliveryDate: "2026-08-05",
    });
    expect(deliveryDateOf(stamped)).toBe("2026-08-05");
  });

  it("handles an order with no assignment at all", () => {
    expect(deliveryDateOf(order({ createdAt: "2026-08-01T04:00:00.000Z" }))).toBe("2026-08-02");
  });
});

describe("the reported bug: yesterday's run on today's board", () => {
  const yesterdaysRun = () =>
    [1, 2, 3].map(() =>
      order({
        driverId: "drv-1",
        driverName: "Executive 01",
        status: "DELIVERED",
        paymentStatus: "PAID",
        deliveryDate: "2026-07-31",
        assignedAt: "2026-07-30T16:00:00.000Z",
        deliveredAt: "2026-07-31T03:00:00.000Z",
        updatedAt: "2026-07-31T03:00:00.000Z",
      })
    );

  it("keeps an unclosed past run visible but marks it overdue, not live", () => {
    atIst("2026-08-01T11:36:00");
    const runs = openRuns([driver], yesterdaysRun(), DEFAULT_SERVICE_AREA);
    expect(runs).toHaveLength(1);
    expect(runs[0].deliveryDate).toBe("2026-07-31");
    expect(runs[0].overdue).toBe(true);
    expect(runs[0].finished).toBe(true);
  });

  it("drops it entirely once the office closes the run", () => {
    atIst("2026-08-01T11:36:00");
    const closed = yesterdaysRun().map((o) => ({ ...o, runClosedAt: "2026-08-01T04:00:00.000Z" }));
    expect(openRuns([driver], closed, DEFAULT_SERVICE_AREA)).toHaveLength(0);
  });

  it("does NOT merge today's new order into yesterday's totals", () => {
    // This is the second half of the bug: assigning the day's first order to
    // the same driver made the board read "8 stops · 18/19 orders" across two
    // days' work.
    atIst("2026-08-01T11:36:00");
    const today = order({
      driverId: "drv-1",
      driverName: "Executive 01",
      deliveryDate: "2026-08-02",
      assignedAt: "2026-08-01T06:00:00.000Z",
    });
    const runs = openRuns([driver], [...yesterdaysRun(), today], DEFAULT_SERVICE_AREA);

    expect(runs).toHaveLength(2);
    // Oldest first — the outstanding one leads.
    expect(runs[0].deliveryDate).toBe("2026-07-31");
    expect(runs[0].ordersTotal).toBe(3);
    expect(runs[1].deliveryDate).toBe("2026-08-02");
    expect(runs[1].ordersTotal).toBe(1);
    expect(runs[1].overdue).toBe(false);
  });

  it("counts cash per run, not per driver's lifetime", () => {
    atIst("2026-08-01T11:36:00");
    const today = order({
      driverId: "drv-1",
      status: "DELIVERED",
      paymentStatus: "PAID",
      deliveryDate: "2026-08-01",
      deliveredAt: "2026-08-01T03:30:00.000Z",
    });
    const runs = openRuns([driver], [...yesterdaysRun(), today], DEFAULT_SERVICE_AREA);
    const byDate = Object.fromEntries(runs.map((r) => [r.deliveryDate, r.cashCollected]));
    expect(byDate["2026-07-31"]).toBe(3000);
    expect(byDate["2026-08-01"]).toBe(1000);
  });
});

describe("run membership", () => {
  it("excludes cancelled and closed orders", () => {
    const key = { driverId: "drv-1", deliveryDate: "2026-08-02" };
    const orders = [
      order({ driverId: "drv-1", deliveryDate: "2026-08-02" }),
      order({ driverId: "drv-1", deliveryDate: "2026-08-02", status: "CANCELLED" }),
      order({ driverId: "drv-1", deliveryDate: "2026-08-02", runClosedAt: "2026-08-02T05:00:00Z" }),
      order({ driverId: "drv-2", deliveryDate: "2026-08-02" }),
    ];
    expect(ordersInRun(orders, key)).toHaveLength(1);
  });

  it("ignores drivers who no longer exist", () => {
    // An executive whose account was removed must not resurrect a run.
    const orders = [order({ driverId: "gone", deliveryDate: "2026-08-02" })];
    expect(openRunKeys(orders, [driver])).toHaveLength(0);
  });

  it("gives an unassigned order no run at all", () => {
    expect(openRunKeys([order()], [driver])).toHaveLength(0);
  });
});

describe("how a run is named", () => {
  it("uses words the office uses", () => {
    atIst("2026-08-01T11:00:00");
    expect(runDayLabel("2026-08-01")).toBe("today");
    expect(runDayLabel("2026-08-02")).toBe("tomorrow");
    expect(runDayLabel("2026-07-31")).toBe("yesterday");
    expect(runDayLabel("2026-07-28")).toMatch(/Tue|28/);
  });

  it("calls a run overdue only once its morning has passed", () => {
    atIst("2026-08-01T11:00:00");
    expect(isOverdueRun("2026-07-31")).toBe(true);
    expect(isOverdueRun("2026-08-01")).toBe(false);
    expect(isOverdueRun("2026-08-02")).toBe(false);
  });
});

describe("runProgress without an explicit date", () => {
  it("answers about the oldest open run — the one needing attention", () => {
    atIst("2026-08-01T11:36:00");
    const orders = [
      order({ driverId: "drv-1", status: "DELIVERED", deliveryDate: "2026-07-31" }),
      order({ driverId: "drv-1", deliveryDate: "2026-08-02" }),
    ];
    expect(runProgress(driver, orders, DEFAULT_SERVICE_AREA).deliveryDate).toBe("2026-07-31");
  });

  it("reports an empty run for a driver with nothing on", () => {
    atIst("2026-08-01T11:36:00");
    const run = runProgress(driver, [], DEFAULT_SERVICE_AREA);
    expect(run.ordersTotal).toBe(0);
    expect(run.deliveryDate).toBe("2026-08-02");
  });
});
