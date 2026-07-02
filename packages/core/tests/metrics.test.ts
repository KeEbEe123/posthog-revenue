import { describe, expect, it } from "vitest";
import {
  computeMonthMetrics,
  deferRevenue,
  monthlyValue,
  mrrForMonth,
  topCustomers,
  churnRiskAccounts,
  type RevenueDataset,
  type Subscription,
  type RevenueEvent,
  type Customer,
} from "@revenue-recipes/core";

// Small builder helpers so each table row is easy to hand-verify.
const cust = (id: string, createdAt: string): Customer => ({ id, name: id, createdAt });
const monthlySub = (
  id: string,
  customerId: string,
  periodStart: string,
  periodEnd: string,
  amount: number,
): Subscription => ({ id, customerId, periodStart, periodEnd, amount, interval: "month", status: "active", currency: "USD" });
const event = (
  id: string,
  customerId: string,
  timestamp: string,
  amount: number,
  extra: Partial<RevenueEvent> = {},
): RevenueEvent => ({ id, customerId, timestamp, amount, kind: "subscription", ...extra });

const dataset = (d: Partial<RevenueDataset>): RevenueDataset => ({
  customers: d.customers ?? [],
  subscriptions: d.subscriptions ?? [],
  revenueEvents: d.revenueEvents ?? [],
  goals: d.goals ?? [],
});

describe("monthlyValue", () => {
  it("normalizes yearly subscriptions to a month", () => {
    expect(monthlyValue({ interval: "year", amount: 1200 } as Subscription)).toBe(100);
    expect(monthlyValue({ interval: "month", amount: 99 } as Subscription)).toBe(99);
  });
});

describe("mrrForMonth", () => {
  it("counts a subscription only on months where it is active on the last day", () => {
    // Active Jan only: period [Jan 1, Feb 1)
    const data = dataset({
      customers: [cust("A", "2025-01-01")],
      subscriptions: [monthlySub("s1", "A", "2025-01-01", "2025-02-01", 100)],
    });
    expect(mrrForMonth(data.subscriptions, "2025-01")).toBe(100);
    expect(mrrForMonth(data.subscriptions, "2025-02")).toBe(0);
  });

  it("treats a mid-period cancellation as inactive on the last day of the month", () => {
    // Active Jan 15 .. Feb 20. Last day of Jan (31st) is inside -> counts.
    // Last day of Feb (28th) is after Feb 20 -> does NOT count.
    const subs = [monthlySub("s1", "A", "2025-01-15", "2025-02-20", 100)];
    expect(mrrForMonth(subs, "2025-01")).toBe(100);
    expect(mrrForMonth(subs, "2025-02")).toBe(0);
  });
});

describe("computeMonthMetrics — breakdown", () => {
  it("new MRR + zero churn => LTV is null", () => {
    const data = dataset({
      customers: [cust("A", "2025-01-01")],
      subscriptions: [monthlySub("s1", "A", "2025-01-01", "2025-02-01", 100)],
      revenueEvents: [event("e1", "A", "2025-01-05", 100)],
    });
    const m = computeMonthMetrics(data, "2025-01");
    expect(m.mrr).toBe(100);
    expect(m.arr).toBe(1200);
    expect(m.newMrr).toBe(100);
    expect(m.newCustomers).toBe(1);
    expect(m.churnRate).toBe(0);
    expect(m.ltv).toBeNull(); // zero churn -> no LTV
  });

  it("expansion: existing customer pays more than the prior period", () => {
    const data = dataset({
      customers: [cust("A", "2025-01-01")],
      subscriptions: [
        monthlySub("s1", "A", "2025-01-01", "2025-02-01", 100),
        monthlySub("s2", "A", "2025-02-01", "2025-03-01", 150),
      ],
    });
    const m = computeMonthMetrics(data, "2025-02");
    expect(m.mrr).toBe(150);
    expect(m.expansion).toBe(50);
    expect(m.contraction).toBe(0);
    expect(m.newMrr).toBe(0);
  });

  it("contraction: existing customer pays less than the prior period", () => {
    const data = dataset({
      customers: [cust("A", "2025-01-01")],
      subscriptions: [
        monthlySub("s1", "A", "2025-01-01", "2025-02-01", 150),
        monthlySub("s2", "A", "2025-02-01", "2025-03-01", 100),
      ],
    });
    const m = computeMonthMetrics(data, "2025-02");
    expect(m.mrr).toBe(100);
    expect(m.contraction).toBe(50);
    expect(m.expansion).toBe(0);
  });

  it("churn with zero revenue => LTV is 0 (churn exists, revenue is 0)", () => {
    // Active Jan only, no revenue events in Feb.
    const data = dataset({
      customers: [cust("A", "2025-01-01")],
      subscriptions: [monthlySub("s1", "A", "2025-01-01", "2025-02-01", 100)],
      revenueEvents: [event("e1", "A", "2025-01-05", 100)],
    });
    const feb = computeMonthMetrics(data, "2025-02");
    expect(feb.mrr).toBe(0);
    expect(feb.churn).toBe(100);
    expect(feb.churnedCustomers).toBe(1);
    expect(feb.churnRate).toBe(1); // 1 churned / 1 previously active
    expect(feb.grossRevenue).toBe(0);
    expect(feb.arpu).toBe(0);
    expect(feb.ltv).toBe(0); // churn exists but revenue 0 => 0
  });

  it("gross revenue includes one-off charges and refunds (negative)", () => {
    const data = dataset({
      customers: [cust("A", "2025-01-01")],
      subscriptions: [monthlySub("s1", "A", "2025-01-01", "2025-02-01", 100)],
      revenueEvents: [
        event("e1", "A", "2025-01-05", 100),
        event("e2", "A", "2025-01-10", 50, { kind: "oneoff" }),
        event("e3", "A", "2025-01-20", -30, { kind: "refund" }),
      ],
    });
    const m = computeMonthMetrics(data, "2025-01");
    expect(m.grossRevenue).toBe(120); // 100 + 50 - 30
    expect(m.arpu).toBe(120); // one active user
  });
});

describe("deferRevenue — multi-month lump sum split proportionally", () => {
  it("splits a lump sum across covered months by day count", () => {
    // $900 covering Jan 1 .. Apr 1 2025 = 90 days (Jan 31 + Feb 28 + Mar 31).
    const e = event("e1", "A", "2025-01-01", 900, {
      periodStart: "2025-01-01",
      periodEnd: "2025-04-01",
    });
    const slices = deferRevenue(e);
    expect(slices).toHaveLength(3);
    expect(slices[0]).toEqual({ month: "2025-01", amount: 900 * 31 / 90 }); // 310
    expect(slices[1]).toEqual({ month: "2025-02", amount: 900 * 28 / 90 }); // 280
    expect(slices[2]).toEqual({ month: "2025-03", amount: 900 * 31 / 90 }); // 310
    const total = slices.reduce((s, x) => s + x.amount, 0);
    expect(total).toBeCloseTo(900, 6);
  });

  it("keeps one-off events (no period) entirely in their month", () => {
    const e = event("e1", "A", "2025-05-10", 250, { kind: "oneoff" });
    expect(deferRevenue(e)).toEqual([{ month: "2025-05", amount: 250 }]);
  });
});

describe("topCustomers — ranked by deferred revenue in range", () => {
  it("attributes a multi-month lump sum proportionally to the range", () => {
    const data = dataset({
      customers: [cust("A", "2025-01-01"), cust("B", "2025-01-01")],
      revenueEvents: [
        // A: annual lump sum $900 over Jan-Apr, but range is only Jan-Mar (=900).
        event("eA", "A", "2025-01-01", 900, {
          periodStart: "2025-01-01",
          periodEnd: "2025-04-01",
        }),
        // B: two one-off charges in range totalling 400.
        event("eB1", "B", "2025-01-15", 250, { kind: "oneoff" }),
        event("eB2", "B", "2025-02-15", 150, { kind: "oneoff" }),
      ],
    });
    const top = topCustomers(data, { start: "2025-01-01", end: "2025-03-31" }, 10);
    expect(top).toEqual([
      { customerId: "A", name: "A", revenue: 900 },
      { customerId: "B", name: "B", revenue: 400 },
    ]);
  });
});

describe("churnRiskAccounts — contracting MRR", () => {
  it("flags a still-paying customer whose MRR dropped vs the prior period", () => {
    const data = dataset({
      customers: [cust("A", "2025-01-01")],
      subscriptions: [
        monthlySub("s1", "A", "2025-01-01", "2025-02-01", 200),
        monthlySub("s2", "A", "2025-02-01", "2025-03-01", 100),
      ],
    });
    const risk = churnRiskAccounts(data, "2025-02");
    expect(risk).toEqual([
      { customerId: "A", name: "A", current: 100, previous: 200, dropPct: 0.5 },
    ]);
  });
});
