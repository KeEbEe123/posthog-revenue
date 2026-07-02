# Revenue Recipes — PostHog app

A **real, installable PostHog app** (plugin), not a demo shim. It implements the
official plugin contract (`plugin.json` + `processEvent`) and can be submitted
through PostHog's [app review process](https://posthog.com/docs/apps/build).

## What it does

For every event named by `revenueEventName` (default `revenue`), it adds these
properties **in place** (non-revenue events pass through untouched):

| Property | Meaning |
|----------|---------|
| `rr_normalized_amount` | The charged amount as a number |
| `rr_currency` | Currency (from your property, or the default) |
| `rr_kind` | `subscription` \| `oneoff` \| `refund` (refund = negative amount) |
| `rr_is_subscription` | Whether the subscription property was present |
| `rr_monthly_mrr` | MRR contribution — annual charges normalized to a month |
| `rr_period_month` | `YYYY-MM` of the event |
| `rr_mrr_movement` | `new` \| `expansion` \| `contraction` \| `flat` vs the customer's last subscription amount |
| `rr_mrr_delta` | Change in monthly MRR vs the customer's previous charge |

The point: once these are on the event, **MRR, expansion, contraction, and churn
are answerable directly in PostHog insights and SQL** — no external service, and
independent of the deprecated Revenue Analytics dashboard. `rr_mrr_movement` is
tracked per `distinct_id` using the plugin's `storage` extension.

## Config (`plugin.json`)

`revenueEventName`, `amountProperty`, `currencyProperty`, `subscriptionProperty`,
`intervalProperty`, `defaultCurrency` — see `plugin.json` for defaults and hints.

## Contract

```ts
export async function processEvent(event: PluginEvent, meta: Meta): Promise<PluginEvent>
```

`main` points at `index.ts`; PostHog's plugin server transpiles the TypeScript
entry. Types come from [`@posthog/plugin-scaffold`](https://www.npmjs.com/package/@posthog/plugin-scaffold).

## Test

```bash
npm test --workspace @revenue-recipes/posthog-app
```

Runs `processEvent` against sample events with a fake `storage` that matches the
plugin `StorageExtension` contract.
