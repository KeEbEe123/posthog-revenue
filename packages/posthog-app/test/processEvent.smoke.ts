// Smoke test for the PostHog app's processEvent, with a fake storage matching
// the plugin StorageExtension contract. Run: npm test (from packages/posthog-app).

import { processEvent } from "../index.js";

function fakeStorage() {
  const map = new Map<string, unknown>();
  return {
    get: async (k: string, d?: unknown) => (map.has(k) ? map.get(k) : d),
    set: async (k: string, v: unknown) => void map.set(k, v),
    del: async (k: string) => void map.delete(k),
  };
}

const config = {
  revenueEventName: "revenue",
  amountProperty: "amount",
  currencyProperty: "currency",
  subscriptionProperty: "subscription_id",
  intervalProperty: "interval",
  defaultCurrency: "USD",
};

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function run(event: any, storage: any) {
  // Cast: the fake matches the subset of Meta the function uses.
  return processEvent(event, { config, storage } as any);
}

async function main() {
  const storage = fakeStorage();

  // Non-revenue event passes through untouched.
  const other = await run({ event: "pageview", distinct_id: "u1", properties: {} }, storage);
  assert(!("rr_kind" in (other.properties ?? {})), "pageview not enriched");

  // New subscription (annual, normalized to MRR).
  const e1 = await run(
    {
      event: "revenue",
      distinct_id: "acme",
      timestamp: "2025-01-10T00:00:00Z",
      properties: { amount: 1200, currency: "USD", subscription_id: "s1", interval: "year" },
    },
    storage,
  );
  console.log("annual new:", JSON.stringify(e1.properties));
  assert(e1.properties!.rr_monthly_mrr === 100, "1200/yr -> 100 MRR");
  assert(e1.properties!.rr_mrr_movement === "new", "first sub = new");
  assert(e1.properties!.rr_period_month === "2025-01", "period month");

  // Expansion next period.
  const e2 = await run(
    {
      event: "revenue",
      distinct_id: "acme",
      timestamp: "2025-02-10T00:00:00Z",
      properties: { amount: 1800, subscription_id: "s1", interval: "year" },
    },
    storage,
  );
  assert(e2.properties!.rr_monthly_mrr === 150, "1800/yr -> 150 MRR");
  assert(e2.properties!.rr_mrr_movement === "expansion", "150 > 100 = expansion");
  assert(e2.properties!.rr_mrr_delta === 50, "delta 50");

  // One-off purchase.
  const e3 = await run(
    { event: "revenue", distinct_id: "acme", timestamp: "2025-02-11T00:00:00Z", properties: { amount: 40 } },
    storage,
  );
  assert(e3.properties!.rr_kind === "oneoff", "no sub prop = oneoff");
  assert(e3.properties!.rr_monthly_mrr === 0, "one-off contributes 0 MRR");

  // Refund.
  const e4 = await run(
    { event: "revenue", distinct_id: "acme", timestamp: "2025-02-12T00:00:00Z", properties: { amount: -40 } },
    storage,
  );
  assert(e4.properties!.rr_kind === "refund", "negative = refund");

  console.log("\nprocessEvent enrichment OK ✓");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
