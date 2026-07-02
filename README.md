# Revenue Recipes

> **Working name.** `revenue-recipes` is a placeholder for the repo/package
> scope. The final public name still needs a trademark/collision check before
> any real launch.

## 1. The problem

PostHog is removing its Revenue Analytics dashboard. From
[posthog.com/docs/revenue-analytics](https://posthog.com/docs/revenue-analytics),
verbatim:

> Revenue analytics is being deprecated. We'll remove the Revenue analytics
> dashboard on or after June 30th, 2026. We're not stepping away from revenue
> in PostHog — we're rethinking how it should work. Instead of maintaining a
> single, opinionated Revenue analytics dashboard, we're focusing on exposing
> revenue properties on persons and groups so you can use them everywhere:
> insights, SQL, and persons/groups profiles. Each use case (ecommerce, SaaS,
> recurring revenue, one-off, services, multi-tenant) can then build the
> dashboard it actually needs — or have PostHog AI and agents via our MCP
> build it for you.

## 2. What this is

Revenue Recipes is a working, open-source implementation of exactly that pivot:
a framework-agnostic metrics engine that reproduces PostHog's revenue formulas
(MRR, ARR, new/expansion/contraction/churn, gross revenue, ARPU, LTV, churn
rate, deferred-revenue top customers, goals), wrapped in three deliverables that
share it — an **MCP server** so an agent can build revenue answers on demand, a
real installable **PostHog app** that tags revenue events with queryable
metrics, and a standalone **dashboard** that visually replaces the deprecated
one. It runs fully on seeded demo data with zero configuration, and connects to
a real PostHog project via a personal API key.

## 3. Quickstart — demo mode (no config)

```bash
npm install
npm run dev        # dashboard at http://localhost:5173 with 18 months of seeded data
```

Other demo commands:

```bash
npm test           # all packages, incl. edge-case metrics tests
npm run build      # type-check + build every package
npm run seed -- --summary   # print the deterministic demo dataset summary
npm run mcp        # start the MCP server (stdio) against demo data
```

## 4. Quickstart — connect a real PostHog project

Two ways to point at live data. Both read credentials from the environment or
in-memory only — **nothing is hardcoded, logged, or persisted.**

**Dashboard:** click **Connect PostHog** and enter host, project ID, and a
personal API key (held in memory for the session; cleared on refresh).

**MCP server / Node:** set env vars, then use `dataSource: "posthog"`:

```bash
export POSTHOG_HOST=https://us.posthog.com
export POSTHOG_PROJECT_ID=12345
export POSTHOG_PERSONAL_API_KEY=phx_...
npm run mcp
```

See [`.env.example`](./.env.example). Data is read via the PostHog Query API
(HogQL). The exact revenue event/property names are configurable — see
`PostHogSource` in `packages/core/src/sources/posthogSource.ts`.

## 5. MCP usage

Once the server is registered with Claude (Desktop/Code) or PostHog AI, ask:

- "What's our MRR expansion this quarter?"
- "Show the MRR breakdown for the last 6 months."
- "Which accounts are at risk of churning?"
- "Who are our top 5 customers by revenue this year?"

Tools: `get_revenue_summary`, `get_mrr_breakdown`, `get_top_customers`,
`get_churn_risk_accounts`. Details in
[`packages/mcp-server/README.md`](./packages/mcp-server/README.md).

## 5b. Install as a PostHog plugin

This repo doubles as an installable PostHog plugin. The root `plugin.json` +
`index.js` are a self-contained, dependency-free build of the app in
`packages/posthog-app` — so you can install it directly:

1. PostHog → **Data pipeline / Plugins** → **Advanced** tab.
2. **Install from GitHub** using this repo's URL:
   `https://github.com/KeEbEe123/posthog-revenue`.
3. Configure the revenue event and property names.

The TypeScript source of record is `packages/posthog-app/index.ts`; the root
`index.js` mirrors it in plain JS for the installer.

## 6. Architecture

```
                     ┌───────────────────────────────┐
                     │   @revenue-recipes/core         │
                     │   pure metrics engine           │
                     │   MRR · ARR · breakdown · ARPU  │
                     │   LTV · churn · deferred rev.   │
                     │   + DataSource interface        │
                     └───────────────┬─────────────────┘
             ┌───────────────────────┼────────────────────────┐
             │                       │                         │
   ┌─────────▼─────────┐   ┌─────────▼─────────┐    ┌──────────▼──────────┐
   │  DemoSource       │   │  PostHogSource     │    │  consumers          │
   │  seeded 18-mo     │   │  Query API (HogQL) │    │                     │
   │  (deterministic)  │   │  env/config creds  │    │  • mcp-server (4    │
   └───────────────────┘   └────────────────────┘    │    tools, stdio)    │
                                                      │  • dashboard (React)│
   ┌───────────────────────────────────────────┐    │  • posthog-app      │
   │  posthog-app: processEvent tags events with │    │    (processEvent)   │
   │  rr_* metric props (independent of core)    │    └─────────────────────┘
   └───────────────────────────────────────────┘

   scripts/seed-demo.ts — deterministic generator (seed 42), shared by DemoSource
```

Every metric is defined once, in `core`. The MCP server, dashboard, and tests
all call the same functions — no formula is implemented twice.

## 7. What's stubbed / what a real v1 would need next

This is a portfolio project, not a finished product. Honest gaps:

- **`PostHogSource` is best-effort.** PostHog doesn't prescribe one revenue
  event schema, so the HogQL queries assume conventional property names
  (`amount`, `subscription_id`, `period_start/end`) and derive subscriptions by
  grouping revenue events. A real deployment must adapt these to its project and
  probably read revenue properties off persons/groups directly. Browser→PostHog
  calls may also hit CORS; the MCP server / Node path is unaffected.
- **Goals are local.** They live in the dataset (demo) or are user-defined;
  PostHog has no goals concept to read, so `getGoals()` returns `[]` for the
  live source. Persisting user goals would need a small store.
- **Reactivation** (a lapsed customer returning) is currently counted as
  expansion rather than a distinct category.
- **The PostHog app hasn't been submitted** for review — it implements the real
  contract (`plugin.json` + `processEvent`, types from `@posthog/plugin-scaffold`)
  and passes a local smoke test, but the review/publish step is not done.
- **Dashboard is intentionally small** — 4 pages, single trailing-period view,
  no date-range picker, no auth, single currency in the UI.
- **Multi-currency** is carried on events but not normalized (no FX rates).
- **No persistence / backend** — everything is computed in-process from the
  chosen data source.

## License

MIT — see [LICENSE](./LICENSE).
