#!/usr/bin/env node
// MCP server for Revenue Recipes. Thin adapter: every tool delegates to
// ./tools.ts, which delegates to @revenue-recipes/core. Speaks MCP over stdio.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getChurnRiskAccounts,
  getMrrBreakdown,
  getRevenueSummary,
  getTopCustomers,
} from "./tools.js";

const dataSource = z
  .enum(["demo", "posthog"])
  .default("demo")
  .describe("Which backend to read: seeded 'demo' data or a live 'posthog' project (env creds).");
const period = z
  .union([z.number().int().positive(), z.literal("all")])
  .optional()
  .describe("Trailing number of months to include (e.g. 3, 12), or 'all'. Default 12.");

const asText = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const server = new McpServer({
  name: "revenue-recipes",
  version: "0.1.0",
});

server.tool(
  "get_revenue_summary",
  "Headline revenue metrics for a trailing period: MRR, ARR, gross revenue, " +
    "ARPU, LTV, churn rate, active/new/churned customers, plus visible revenue goals.",
  { period, dataSource },
  async (args) => asText(await getRevenueSummary(args)),
);

server.tool(
  "get_mrr_breakdown",
  "Month-by-month MRR movement (new / expansion / contraction / churn) plus " +
    "totals for the trailing period.",
  { period, dataSource },
  async (args) => asText(await getMrrBreakdown(args)),
);

server.tool(
  "get_top_customers",
  "Top customers ranked by deferred revenue in the period (multi-month lump " +
    "sums split proportionally across months).",
  { period, limit: z.number().int().positive().optional().describe("Max rows (default 10)."), dataSource },
  async (args) => asText(await getTopCustomers(args)),
);

server.tool(
  "get_churn_risk_accounts",
  "Accounts whose MRR is contracting versus the prior period — early warning " +
    "before they churn outright.",
  { dataSource },
  async (args) => asText(await getChurnRiskAccounts(args)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only — stdout is the MCP transport.
  process.stderr.write("revenue-recipes MCP server ready (stdio)\n");
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
