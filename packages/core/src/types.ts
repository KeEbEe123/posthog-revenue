// Core domain types for the revenue metrics engine.
// All monetary amounts are in currency major units (e.g. dollars, not cents).

/** ISO date string, e.g. "2025-01-31" or a full ISO timestamp. */
export type ISODate = string;

/** A month bucket, "YYYY-MM". */
export type MonthKey = string;

export interface Customer {
  id: string;
  name: string;
  /** When this customer first appeared. Used to decide "new in the period". */
  createdAt: ISODate;
}

/**
 * A billing period for a recurring subscription. A customer whose price
 * changes over time is represented by multiple consecutive Subscription rows.
 * This is what drives MRR: a subscription contributes to MRR on any date D
 * where periodStart <= D < periodEnd.
 */
export interface Subscription {
  id: string;
  customerId: string;
  periodStart: ISODate;
  /** Exclusive. The customer is no longer active on/after this date. */
  periodEnd: ISODate;
  /** Charge for one billing interval (not normalized to a month). */
  amount: number;
  interval: "month" | "year";
  status: "active" | "cancelled";
  currency?: string;
}

export type RevenueKind = "subscription" | "oneoff" | "refund";

/**
 * An actual cash movement. Drives gross revenue, ARPU, and deferred-revenue
 * top-customer ranking. Subscription charges also appear here (kind
 * "subscription") alongside one-off purchases and refunds (negative amount).
 */
export interface RevenueEvent {
  id: string;
  customerId: string;
  /** When the charge occurred. */
  timestamp: ISODate;
  /** Positive for charges, negative for refunds. */
  amount: number;
  kind: RevenueKind;
  currency?: string;
  subscriptionId?: string;
  /** Coverage window for deferred revenue. Defaults to a single day at timestamp. */
  periodStart?: ISODate;
  /** Exclusive end of coverage window. */
  periodEnd?: ISODate;
}

export interface Goal {
  id: string;
  label: string;
  metric: "mrr" | "arr" | "gross";
  target: number;
  /** Deadline for hitting the target. */
  dueDate: ISODate;
}

/** Full metric snapshot for a single month. */
export interface MonthMetrics {
  month: MonthKey;
  /** MRR on the last day of the month. */
  mrr: number;
  /** ARR = MRR * 12. */
  arr: number;
  newMrr: number;
  expansion: number;
  contraction: number;
  churn: number;
  /** All cash in the month incl. one-off + refunds (negative). */
  grossRevenue: number;
  /** grossRevenue / activeUsers. */
  arpu: number;
  /** arpu / churnRate. null when churnRate === 0 (matches PostHog). */
  ltv: number | null;
  /** churnedCustomers / customers active in the previous period. */
  churnRate: number;
  activeCustomers: number;
  newCustomers: number;
  churnedCustomers: number;
  activeSubscriptions: number;
}

/** Aggregate metrics for a selected range. Point-in-time fields (mrr, arr,
 *  counts, arpu, ltv, churnRate) reflect the latest month; flow fields
 *  (newMrr, expansion, contraction, churn, grossRevenue) are summed. */
export type PeriodMetrics = MonthMetrics;

export interface TopCustomer {
  customerId: string;
  name: string;
  /** Deferred revenue attributed to the range. */
  revenue: number;
}

export interface ChurnRiskAccount {
  customerId: string;
  name: string;
  /** MRR in the most recent complete period. */
  current: number;
  /** MRR in the prior period. */
  previous: number;
  /** Fractional decline, 0..1 (e.g. 0.25 = down 25%). */
  dropPct: number;
}

/** A month/year range, inclusive of both endpoint months. */
export interface DateRange {
  /** "YYYY-MM-DD" — any day; the month is what matters. */
  start: ISODate;
  end: ISODate;
}

export interface RevenueDataset {
  customers: Customer[];
  subscriptions: Subscription[];
  revenueEvents: RevenueEvent[];
  goals: Goal[];
}
