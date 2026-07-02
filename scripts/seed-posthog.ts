// Push the deterministic demo dataset (seed 42) to a live PostHog project via
// the batch capture API. Populates ~18 months of `revenue` events with real
// new / expansion / contraction / churn so the live dashboard + MCP (dataSource
// "posthog") and the installed plugin have something to work with.
//
// The ingestion key is PUBLIC (phc_...) but still passed in — never hardcoded:
//   npx tsx scripts/seed-posthog.ts <phc_key> [host]
//   POSTHOG_INGEST_KEY=phc_... npx tsx scripts/seed-posthog.ts
//
// Property names match the plugin's default config (amount, currency,
// subscription_id, interval, period_start, period_end).

import { generateDataset } from "@revenue-recipes/core";

const apiKey = process.argv[2] ?? process.env.POSTHOG_INGEST_KEY;
const host = (process.argv[3] ?? process.env.POSTHOG_HOST ?? "https://us.posthog.com").replace(/\/$/, "");

if (!apiKey) {
  console.error("Usage: tsx scripts/seed-posthog.ts <phc_ingest_key> [host]");
  process.exit(1);
}

const MS_PER_DAY = 86_400_000;
function monthsBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / MS_PER_DAY / 30.4;
}

const data = generateDataset({ seed: 42 });
const nameById = new Map(data.customers.map((c) => [c.id, c.name]));

const batch = data.revenueEvents.map((e) => {
  const properties: Record<string, unknown> = {
    amount: e.amount,
    currency: e.currency ?? "USD",
    // Stamp the person's name on every event so the persons table is named
    // regardless of $identify ordering.
    $set: { name: nameById.get(e.customerId) ?? e.customerId },
  };
  if (e.subscriptionId) {
    properties.subscription_id = e.subscriptionId;
    // Annual lump sums cover ~12 months; monthly charges ~1.
    properties.interval = e.periodStart && e.periodEnd && monthsBetween(e.periodStart, e.periodEnd) > 6 ? "year" : "month";
  }
  if (e.periodStart) properties.period_start = e.periodStart;
  if (e.periodEnd) properties.period_end = e.periodEnd;
  return {
    event: "revenue",
    distinct_id: e.customerId,
    timestamp: e.timestamp,
    properties,
  };
});

// Also register person display names so top-customer tables read nicely.
const identifies = data.customers.map((c) => ({
  event: "$identify",
  distinct_id: c.id,
  timestamp: c.createdAt,
  properties: { $set: { name: c.name } },
}));

const all = [...identifies, ...batch];
const CHUNK = 100;

async function main() {
  let sent = 0;
  for (let i = 0; i < all.length; i += CHUNK) {
    const slice = all.slice(i, i + CHUNK);
    const res = await fetch(`${host}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, batch: slice }),
    });
    if (!res.ok) {
      console.error(`Batch ${i / CHUNK} failed: ${res.status} ${res.statusText}`);
      console.error(await res.text());
      process.exit(1);
    }
    sent += slice.length;
    console.log(`sent ${sent}/${all.length}`);
  }
  console.log(`\nDone. ${identifies.length} identifies + ${batch.length} revenue events -> ${host}`);
  console.log("Events may take a minute to appear. Enable the plugin to get rr_* enrichment on new events.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
