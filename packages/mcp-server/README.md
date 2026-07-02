# @revenue-recipes/mcp-server

An [MCP](https://modelcontextprotocol.io) server that exposes Revenue Recipes'
metrics as tools, so an agent (Claude Desktop, Claude Code, or PostHog AI) can
answer revenue questions and build views on demand — the "have agents build it
for you" path from PostHog's revenue-analytics deprecation notice.

Every tool delegates to `@revenue-recipes/core`; no metric logic is duplicated here.

## Tools

| Tool | Args | Returns |
|------|------|---------|
| `get_revenue_summary` | `period?` (months or `"all"`, default 12), `dataSource` (`demo`\|`posthog`) | MRR, ARR, gross, ARPU, LTV, churn rate, customer counts, visible goals |
| `get_mrr_breakdown` | `period?`, `dataSource` | Month-by-month new / expansion / contraction / churn + totals |
| `get_top_customers` | `period?`, `limit?` (default 10), `dataSource` | Customers ranked by deferred revenue |
| `get_churn_risk_accounts` | `dataSource` | Accounts with contracting MRR vs the prior period |

`dataSource: "demo"` uses the seeded 18-month dataset (zero config).
`dataSource: "posthog"` reads a live project via the Query API and requires:

```
POSTHOG_PERSONAL_API_KEY=phx_...
POSTHOG_PROJECT_ID=12345
POSTHOG_HOST=https://us.posthog.com   # or your self-hosted host
```

These are read from the environment only — never hardcoded or logged.

## Run

```bash
npm run build --workspace @revenue-recipes/mcp-server
npm run start --workspace @revenue-recipes/mcp-server   # speaks MCP over stdio
```

Register with Claude Desktop / Claude Code (`claude mcp add`), pointing the
command at `node <repo>/packages/mcp-server/dist/index.js`.

### Smoke tests

```bash
npm test --workspace @revenue-recipes/mcp-server   # direct tool calls
npx tsx packages/mcp-server/test/mcp.client.ts      # full stdio round-trip
```

## Example prompts (once connected)

- "What's our MRR expansion this quarter?"
- "Show me the MRR breakdown for the last 6 months."
- "Which accounts are at risk of churning?"
- "Who are our top 5 customers by revenue this year?"
- "What's our current ARR and are we on track to hit the ARR goal?"
