// End-to-end MCP smoke test: spawns the built server over stdio, lists tools,
// and calls all four. Requires `npm run build` first. Run: tsx test/mcp.client.ts

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, "../dist/index.js");

async function main() {
  const transport = new StdioClientTransport({ command: "node", args: [serverPath] });
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log("tools:", tools.map((t) => t.name).join(", "));

  for (const [name, args] of [
    ["get_revenue_summary", { period: 6, dataSource: "demo" }],
    ["get_mrr_breakdown", { period: 6, dataSource: "demo" }],
    ["get_top_customers", { limit: 3, dataSource: "demo" }],
    ["get_churn_risk_accounts", { dataSource: "demo" }],
  ] as const) {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { type: string; text: string }[])[0]?.text ?? "";
    console.log(`\n=== ${name} ===\n${text.slice(0, 600)}`);
  }

  await client.close();
  console.log("\nMCP stdio round-trip OK ✓");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
