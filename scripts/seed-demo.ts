// Deterministic demo-data seeder. Prints the generated dataset as JSON (or a
// summary). Reproducible: a fixed seed => identical output every run.
//
//   npx tsx scripts/seed-demo.ts            # summary to stderr, JSON to stdout
//   npx tsx scripts/seed-demo.ts --summary  # human-readable summary only
//
// The generator lives in @revenue-recipes/core so the demo DataSource, the
// dashboard, and this script all share one source of truth.

import {
  computeSeries,
  demoRange,
  generateDataset,
} from "@revenue-recipes/core";

const summaryOnly = process.argv.includes("--summary");

const data = generateDataset({ seed: 42 });
const range = demoRange();
const series = computeSeries(data, range);
const latest = series[series.length - 1];

const summary = {
  window: range,
  customers: data.customers.length,
  subscriptions: data.subscriptions.length,
  revenueEvents: data.revenueEvents.length,
  latestMonth: latest.month,
  latestMrr: latest.mrr,
  latestArr: latest.arr,
  activeCustomers: latest.activeCustomers,
};

process.stderr.write(`Revenue Recipes demo dataset (seed 42)\n`);
process.stderr.write(JSON.stringify(summary, null, 2) + "\n");

if (!summaryOnly) {
  process.stdout.write(JSON.stringify({ ...data, series }, null, 2) + "\n");
}
