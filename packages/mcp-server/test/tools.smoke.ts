// Direct smoke test of the four tool functions against demo data.
// Run: npm test  (from packages/mcp-server) — no build, no stdio.

import {
  getChurnRiskAccounts,
  getMrrBreakdown,
  getRevenueSummary,
  getTopCustomers,
} from "../src/tools.js";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const summary = await getRevenueSummary({ period: 12, dataSource: "demo" });
  console.log("get_revenue_summary:", JSON.stringify(summary.metrics));
  assert(summary.metrics.mrr > 0, "summary MRR should be > 0");
  assert(summary.metrics.arr === summary.metrics.mrr * 12, "ARR = MRR*12");

  const breakdown = await getMrrBreakdown({ period: 12, dataSource: "demo" });
  console.log("get_mrr_breakdown totals:", JSON.stringify(breakdown.totals));
  assert(breakdown.byMonth.length > 0, "breakdown should have months");

  const top = await getTopCustomers({ period: "all", limit: 5, dataSource: "demo" });
  console.log("get_top_customers:", JSON.stringify(top.customers));
  assert(top.customers.length === 5, "should return 5 top customers");
  assert(top.customers[0].revenue >= top.customers[4].revenue, "sorted desc");

  const risk = await getChurnRiskAccounts({ dataSource: "demo" });
  console.log("get_churn_risk_accounts:", JSON.stringify(risk.accounts.slice(0, 3)));
  assert(Array.isArray(risk.accounts), "risk accounts is an array");

  console.log("\nAll 4 tools OK ✓");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
