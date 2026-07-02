// Deterministic demo-data generator. No Math.random / no wall-clock — a fixed
// seed produces byte-identical output every run, so the demo is reproducible
// and reviewable. Data spans a fixed 18-month window (2025-01 .. 2026-06) with
// a deliberate mix of new / expansion / contraction / churn, plus one-off
// purchases, refunds, and an annual lump-sum customer for deferred revenue.

import type {
  Customer,
  Goal,
  RevenueDataset,
  RevenueEvent,
  Subscription,
} from "../types.js";

/** mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WINDOW_MONTHS = 18;
const BASE_YEAR = 2025;
const BASE_MONTH = 1; // January 2025

function monthKeyAt(index: number): string {
  const d = new Date(Date.UTC(BASE_YEAR, BASE_MONTH - 1 + index, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function firstDayOf(index: number): string {
  return `${monthKeyAt(index)}-01`;
}
function monthStartDate(index: number): string {
  // exclusive period end helpers use the first day of a month index
  return firstDayOf(index);
}

const NAMES = [
  "Acme Corp", "Globex", "Initech", "Umbrella", "Hooli", "Stark Industries",
  "Wayne Enterprises", "Cyberdyne", "Wonka", "Soylent", "Massive Dynamic",
  "Vandelay", "Pied Piper", "Aperture", "Tyrell", "Nakatomi", "Oscorp",
  "Gringotts", "Duff", "Prestige Worldwide", "Bluth", "Sterling Cooper",
  "Dunder Mifflin", "Los Pollos", "Wernham Hogg", "Monsters Inc", "Krusty Krab",
  "Rich Industries", "Spacely Sprockets", "Cogswell Cogs", "Genco", "Sirius",
  "Buy n Large", "Weyland", "Abstergo", "Black Mesa", "Aperture Science",
  "Blue Sun", "Encom", "Rekall",
];

const TIERS = [49, 99, 199, 399, 799];

export interface GenerateOptions {
  seed?: number;
  customerCount?: number;
}

export function generateDataset(opts: GenerateOptions = {}): RevenueDataset {
  const seed = opts.seed ?? 42;
  const count = Math.min(opts.customerCount ?? 36, NAMES.length);
  const rand = mulberry32(seed);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  const customers: Customer[] = [];
  const subscriptions: Subscription[] = [];
  const revenueEvents: RevenueEvent[] = [];
  let subSeq = 0;
  let evtSeq = 0;

  for (let i = 0; i < count; i++) {
    const id = `cust_${String(i + 1).padStart(3, "0")}`;
    const name = NAMES[i];
    // Stagger signups across the first ~15 months so later months have both
    // established and brand-new customers.
    const startIdx = Math.floor(rand() * (WINDOW_MONTHS - 3));
    customers.push({ id, name, createdAt: firstDayOf(startIdx) });

    // One in seven customers pays annually (lump sum -> deferred revenue).
    const annual = rand() < 0.14;
    if (annual) {
      const monthly = pick(TIERS);
      const endIdx = Math.min(startIdx + 12, WINDOW_MONTHS);
      subscriptions.push({
        id: `sub_${String(++subSeq).padStart(4, "0")}`,
        customerId: id,
        periodStart: monthStartDate(startIdx),
        periodEnd: monthStartDate(endIdx),
        amount: monthly * 12,
        interval: "year",
        status: endIdx < WINDOW_MONTHS ? "cancelled" : "active",
        currency: "USD",
      });
      // Single lump-sum charge covering the whole year -> deferred monthly.
      revenueEvents.push({
        id: `evt_${String(++evtSeq).padStart(5, "0")}`,
        customerId: id,
        timestamp: firstDayOf(startIdx),
        amount: monthly * 12,
        kind: "subscription",
        currency: "USD",
        subscriptionId: `sub_${String(subSeq).padStart(4, "0")}`,
        periodStart: monthStartDate(startIdx),
        periodEnd: monthStartDate(endIdx),
      });
      continue;
    }

    // Monthly subscriber: walk the price month-by-month, opening a new
    // subscription row whenever the amount changes, closing on churn.
    let amount = pick(TIERS);
    let runStart = startIdx;
    let idx = startIdx;
    const closeRun = (endIdx: number, cancelled: boolean) => {
      subscriptions.push({
        id: `sub_${String(++subSeq).padStart(4, "0")}`,
        customerId: id,
        periodStart: monthStartDate(runStart),
        periodEnd: monthStartDate(endIdx),
        amount,
        interval: "month",
        status: cancelled ? "cancelled" : "active",
        currency: "USD",
      });
    };

    while (idx < WINDOW_MONTHS) {
      // Emit this month's charge.
      revenueEvents.push({
        id: `evt_${String(++evtSeq).padStart(5, "0")}`,
        customerId: id,
        timestamp: firstDayOf(idx),
        amount,
        kind: "subscription",
        currency: "USD",
        subscriptionId: `sub_${String(subSeq + 1).padStart(4, "0")}`,
        periodStart: monthStartDate(idx),
        periodEnd: monthStartDate(idx + 1),
      });

      const roll = rand();
      const monthsAlive = idx - startIdx;
      // Churn chance rises slightly over time; disabled in the first 2 months.
      if (monthsAlive >= 2 && roll < 0.06) {
        closeRun(idx + 1, true); // active this month, gone next month
        break;
      }
      // Expansion.
      if (roll >= 0.06 && roll < 0.16 && amount < TIERS[TIERS.length - 1]) {
        closeRun(idx + 1, false);
        amount = TIERS[Math.min(TIERS.indexOf(amount) + 1, TIERS.length - 1)];
        runStart = idx + 1;
      } else if (roll >= 0.16 && roll < 0.22 && amount > TIERS[0]) {
        // Contraction.
        closeRun(idx + 1, false);
        amount = TIERS[Math.max(TIERS.indexOf(amount) - 1, 0)];
        runStart = idx + 1;
      }

      // Occasional one-off add-on purchase.
      if (rand() < 0.08) {
        revenueEvents.push({
          id: `evt_${String(++evtSeq).padStart(5, "0")}`,
          customerId: id,
          timestamp: firstDayOf(idx),
          amount: 25 + Math.floor(rand() * 12) * 25,
          kind: "oneoff",
          currency: "USD",
        });
      }
      // Rare refund.
      if (rand() < 0.02) {
        revenueEvents.push({
          id: `evt_${String(++evtSeq).padStart(5, "0")}`,
          customerId: id,
          timestamp: firstDayOf(idx),
          amount: -amount,
          kind: "refund",
          currency: "USD",
        });
      }

      idx++;
      if (idx >= WINDOW_MONTHS) {
        closeRun(WINDOW_MONTHS, false); // still active at window end
      }
    }
  }

  const goals: Goal[] = [
    { id: "goal_mrr", label: "MRR target", metric: "mrr", target: 9000, dueDate: `${monthKeyAt(WINDOW_MONTHS - 1)}-28` },
    { id: "goal_arr", label: "ARR milestone", metric: "arr", target: 120000, dueDate: `${monthKeyAt(WINDOW_MONTHS - 1)}-28` },
  ];

  return { customers, subscriptions, revenueEvents, goals };
}

/** The fixed demo window as a range, derived from the generator constants. */
export function demoRange(): { start: string; end: string } {
  return { start: firstDayOf(0), end: firstDayOf(WINDOW_MONTHS - 1) };
}
