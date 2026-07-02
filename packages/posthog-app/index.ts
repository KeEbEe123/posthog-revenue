// Revenue Recipes — a real PostHog app (plugin).
//
// Contract: PostHog calls `processEvent(event, meta)` for every ingested event.
// We enrich revenue events in place with `rr_*` properties so MRR, expansion,
// contraction, churn, and gross revenue become answerable directly in PostHog
// insights / SQL — WITHOUT running any external service. Non-revenue events and
// events missing an amount pass through untouched. We never drop or redirect.
//
// See: https://posthog.com/docs/apps/build and the @posthog/plugin-scaffold
// types for the exact interface.

import type { PluginEvent, PluginMeta, Plugin } from "@posthog/plugin-scaffold";

interface RevenueAppInput {
  config: {
    revenueEventName: string;
    amountProperty: string;
    currencyProperty: string;
    subscriptionProperty: string;
    intervalProperty: string;
    defaultCurrency: string;
  };
}

type Meta = PluginMeta<Plugin<RevenueAppInput>>;

/** MRR contribution of a single charge, normalizing annual charges. */
function monthlyNormalized(amount: number, interval: unknown): number {
  return interval === "year" ? amount / 12 : amount;
}

export async function processEvent(
  event: PluginEvent,
  { config, storage }: Meta,
): Promise<PluginEvent> {
  if (event.event !== config.revenueEventName || !event.properties) {
    return event;
  }

  const props = event.properties;
  const rawAmount = Number(props[config.amountProperty]);
  if (!Number.isFinite(rawAmount)) {
    return event; // nothing to enrich
  }

  const isSubscription = props[config.subscriptionProperty] != null;
  const interval = props[config.intervalProperty];
  const currency = props[config.currencyProperty] ?? config.defaultCurrency;
  const kind = rawAmount < 0 ? "refund" : isSubscription ? "subscription" : "oneoff";
  const monthlyMrr = isSubscription ? monthlyNormalized(rawAmount, interval) : 0;

  const ts = event.timestamp ?? (props.timestamp as string | undefined) ?? "";
  const periodMonth = typeof ts === "string" ? ts.slice(0, 7) : "";

  // Classify MRR movement by comparing to this customer's last subscription
  // amount, tracked in plugin storage keyed by distinct_id.
  let movement: "new" | "expansion" | "contraction" | "flat" | "none" = "none";
  let mrrDelta = 0;
  if (isSubscription) {
    const key = `rr_last_mrr:${event.distinct_id}`;
    const previous = Number((await storage.get(key, 0)) ?? 0);
    if (previous === 0) movement = "new";
    else if (monthlyMrr > previous) movement = "expansion";
    else if (monthlyMrr < previous) movement = "contraction";
    else movement = "flat";
    mrrDelta = monthlyMrr - previous;
    await storage.set(key, monthlyMrr);
  }

  event.properties = {
    ...props,
    rr_normalized_amount: rawAmount,
    rr_currency: currency,
    rr_kind: kind,
    rr_is_subscription: isSubscription,
    rr_monthly_mrr: monthlyMrr,
    rr_period_month: periodMonth,
    rr_mrr_movement: movement,
    rr_mrr_delta: mrrDelta,
  };

  return event;
}
