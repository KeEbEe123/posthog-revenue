// Pure metric functions. No I/O, no wall-clock, no randomness — every result
// is a deterministic function of its inputs, so the tests can assert exact
// hand-computed values. Formulas mirror PostHog's revenue analytics docs.

import type {
  ChurnRiskAccount,
  Customer,
  DateRange,
  MonthKey,
  MonthMetrics,
  RevenueDataset,
  RevenueEvent,
  Subscription,
  TopCustomer,
} from "./types.js";

// ---------------------------------------------------------------------------
// Date helpers (UTC throughout to stay deterministic across timezones)
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function monthKey(date: string): MonthKey {
  return date.slice(0, 7); // "YYYY-MM"
}

function parse(date: string): Date {
  return new Date(date.length <= 10 ? `${date}T00:00:00.000Z` : date);
}

/** First day (00:00 UTC) of a "YYYY-MM" month. */
export function monthStart(month: MonthKey): Date {
  return new Date(`${month}-01T00:00:00.000Z`);
}

/** Last calendar day (00:00 UTC) of a "YYYY-MM" month. */
export function lastDayOfMonth(month: MonthKey): Date {
  const [y, m] = month.split("-").map(Number);
  // day 0 of next month = last day of this month
  return new Date(Date.UTC(y, m, 0));
}

function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive list of month keys covering the range. */
export function monthsInRange(range: DateRange): MonthKey[] {
  const start = monthKey(range.start);
  const end = monthKey(range.end);
  const out: MonthKey[] = [];
  let cur = start;
  // guard against inverted ranges
  while (cur <= end) {
    out.push(cur);
    cur = addMonths(cur, 1);
    if (out.length > 1000) break;
  }
  return out;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// MRR primitives
// ---------------------------------------------------------------------------

/** A subscription's contribution to MRR (normalized to a month). */
export function monthlyValue(sub: Subscription): number {
  return sub.interval === "year" ? sub.amount / 12 : sub.amount;
}

function activeOn(sub: Subscription, date: Date): boolean {
  return parse(sub.periodStart) <= date && date < parse(sub.periodEnd);
}

/** MRR for one customer on a specific date (sum of active subscriptions). */
export function customerMrrOnDate(
  subs: Subscription[],
  customerId: string,
  date: Date,
): number {
  let total = 0;
  for (const s of subs) {
    if (s.customerId === customerId && activeOn(s, date)) total += monthlyValue(s);
  }
  return total;
}

/** MRR for one customer on the last day of a month. */
function customerMrrForMonth(
  subs: Subscription[],
  customerId: string,
  month: MonthKey,
): number {
  return customerMrrOnDate(subs, customerId, lastDayOfMonth(month));
}

/** Total MRR (all customers) on the last day of a month. */
export function mrrForMonth(subs: Subscription[], month: MonthKey): number {
  const date = lastDayOfMonth(month);
  let total = 0;
  const seen = new Set<string>();
  for (const s of subs) seen.add(s.customerId);
  for (const c of seen) total += customerMrrOnDate(subs, c, date);
  return round(total);
}

// ---------------------------------------------------------------------------
// Deferred revenue (multi-month lump sums split proportionally by days)
// ---------------------------------------------------------------------------

/**
 * Split a revenue event across the months its coverage window touches,
 * proportional to the number of days that fall in each month. Events with no
 * period (one-off, refund) land entirely in their timestamp month.
 */
export function deferRevenue(event: RevenueEvent): { month: MonthKey; amount: number }[] {
  const start = event.periodStart ?? event.timestamp;
  const end = event.periodEnd;
  if (!end || parse(end) <= parse(start)) {
    return [{ month: monthKey(event.timestamp), amount: event.amount }];
  }
  const startD = parse(start);
  const endD = parse(end);
  const totalDays = daysBetween(startD, endD);
  if (totalDays === 0) return [{ month: monthKey(start), amount: event.amount }];

  const slices: { month: MonthKey; amount: number }[] = [];
  let m = monthKey(start);
  const lastMonth = monthKey(end); // end is exclusive; may not contribute if it's day 1
  while (m <= lastMonth) {
    const mStart = monthStart(m);
    const nextMStart = monthStart(addMonths(m, 1));
    const overlapStart = startD > mStart ? startD : mStart;
    const overlapEnd = endD < nextMStart ? endD : nextMStart;
    const days = daysBetween(overlapStart, overlapEnd);
    if (days > 0) slices.push({ month: m, amount: (event.amount * days) / totalDays });
    m = addMonths(m, 1);
    if (slices.length > 1000) break;
  }
  return slices;
}

// ---------------------------------------------------------------------------
// Per-month metric computation
// ---------------------------------------------------------------------------

function newInMonth(customer: Customer, month: MonthKey): boolean {
  return monthKey(customer.createdAt) === month;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Compute the full metric snapshot for one month, comparing to the prior month. */
export function computeMonthMetrics(
  data: RevenueDataset,
  month: MonthKey,
): MonthMetrics {
  const { customers, subscriptions, revenueEvents } = data;
  const prevMonth = addMonths(month, -1);
  const custById = new Map(customers.map((c) => [c.id, c]));
  const customerIds = new Set<string>([
    ...customers.map((c) => c.id),
    ...subscriptions.map((s) => s.customerId),
  ]);

  let mrr = 0;
  let newMrr = 0;
  let expansion = 0;
  let contraction = 0;
  let churn = 0;
  let activeCustomers = 0;
  let newCustomers = 0;
  let churnedCustomers = 0;
  let prevActiveCustomers = 0;

  for (const id of customerIds) {
    const cur = customerMrrForMonth(subscriptions, id, month);
    const prev = customerMrrForMonth(subscriptions, id, prevMonth);
    mrr += cur;
    if (cur > 0) activeCustomers++;
    if (prev > 0) prevActiveCustomers++;

    const cust = custById.get(id);
    const isNew = cust ? newInMonth(cust, month) : false;

    if (prev === 0 && cur > 0) {
      if (isNew) {
        newMrr += cur;
        newCustomers++;
      } else {
        // reactivation / net-new spend from a pre-existing customer
        expansion += cur;
      }
    } else if (cur > prev) {
      expansion += cur - prev;
    } else if (cur < prev && cur > 0) {
      contraction += prev - cur;
    } else if (cur < prev && cur === 0) {
      churn += prev;
      churnedCustomers++;
    }
  }

  // Gross revenue + active users from actual cash events in the month.
  let grossRevenue = 0;
  const activeUsers = new Set<string>();
  for (const e of revenueEvents) {
    if (monthKey(e.timestamp) === month) {
      grossRevenue += e.amount;
      activeUsers.add(e.customerId);
    }
  }

  const arpu = activeUsers.size > 0 ? grossRevenue / activeUsers.size : 0;
  const churnRate = prevActiveCustomers > 0 ? churnedCustomers / prevActiveCustomers : 0;
  const ltv = churnRate === 0 ? null : arpu / churnRate;

  const lastDay = lastDayOfMonth(month);
  const activeSubscriptions = subscriptions.filter((s) => activeOn(s, lastDay)).length;

  return {
    month,
    mrr: round(mrr),
    arr: round(mrr * 12),
    newMrr: round(newMrr),
    expansion: round(expansion),
    contraction: round(contraction),
    churn: round(churn),
    grossRevenue: round(grossRevenue),
    arpu: round(arpu),
    ltv: ltv === null ? null : round(ltv),
    churnRate: round(churnRate * 10000) / 10000,
    activeCustomers,
    newCustomers,
    churnedCustomers,
    activeSubscriptions,
  };
}

/** Monthly series across a range (inclusive). */
export function computeSeries(data: RevenueDataset, range: DateRange): MonthMetrics[] {
  return monthsInRange(range).map((m) => computeMonthMetrics(data, m));
}

/**
 * Aggregate metrics for a range: point-in-time fields come from the latest
 * month; flow fields are summed across the range.
 */
export function computePeriodMetrics(data: RevenueDataset, range: DateRange): MonthMetrics {
  const series = computeSeries(data, range);
  if (series.length === 0) {
    throw new Error("computePeriodMetrics: empty range");
  }
  const latest = series[series.length - 1];
  const sum = (pick: (m: MonthMetrics) => number) =>
    round(series.reduce((acc, m) => acc + pick(m), 0));
  return {
    ...latest,
    newMrr: sum((m) => m.newMrr),
    expansion: sum((m) => m.expansion),
    contraction: sum((m) => m.contraction),
    churn: sum((m) => m.churn),
    grossRevenue: sum((m) => m.grossRevenue),
  };
}

// ---------------------------------------------------------------------------
// Top customers (deferred revenue within the range)
// ---------------------------------------------------------------------------

export function topCustomers(
  data: RevenueDataset,
  range: DateRange,
  limit = 10,
): TopCustomer[] {
  const months = new Set(monthsInRange(range));
  const nameById = new Map(data.customers.map((c) => [c.id, c.name]));
  const totals = new Map<string, number>();

  for (const e of data.revenueEvents) {
    for (const slice of deferRevenue(e)) {
      if (months.has(slice.month)) {
        totals.set(e.customerId, (totals.get(e.customerId) ?? 0) + slice.amount);
      }
    }
  }

  return [...totals.entries()]
    .map(([customerId, revenue]) => ({
      customerId,
      name: nameById.get(customerId) ?? customerId,
      revenue: round(revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Churn-risk accounts (MRR contracting over the last two complete periods)
// ---------------------------------------------------------------------------

export function churnRiskAccounts(
  data: RevenueDataset,
  asOfMonth: MonthKey,
): ChurnRiskAccount[] {
  const prevMonth = addMonths(asOfMonth, -1);
  const nameById = new Map(data.customers.map((c) => [c.id, c.name]));
  const ids = new Set(data.subscriptions.map((s) => s.customerId));
  const out: ChurnRiskAccount[] = [];

  for (const id of ids) {
    const current = customerMrrForMonth(data.subscriptions, id, asOfMonth);
    const previous = customerMrrForMonth(data.subscriptions, id, prevMonth);
    // At risk: still paying, but paying less than last period (early warning
    // before an outright cancellation shows up as churn).
    if (previous > 0 && current > 0 && current < previous) {
      out.push({
        customerId: id,
        name: nameById.get(id) ?? id,
        current: round(current),
        previous: round(previous),
        dropPct: round((previous - current) / previous),
      });
    }
  }

  return out.sort((a, b) => b.dropPct - a.dropPct);
}
