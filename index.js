// Revenue Recipes — installable PostHog plugin (root entry).
//
// This is a self-contained, dependency-free plain-JS build of the plugin so it
// installs directly via PostHog's "Install from GitHub" (root plugin.json +
// index.js). The TypeScript source of record lives at
// packages/posthog-app/index.ts and shares the metric definitions in
// packages/core.
//
// Contract: PostHog calls processEvent(event, meta) for every ingested event.
// We enrich events named by `revenueEventName` in place with rr_* properties so
// MRR, expansion, contraction, churn, and gross revenue are answerable directly
// in PostHog insights / SQL — without any external service. Non-revenue events
// and events without a numeric amount pass through untouched.

function monthlyNormalized(amount, interval) {
  return interval === "year" ? amount / 12 : amount;
}

async function processEvent(event, { config, storage }) {
  if (event.event !== config.revenueEventName || !event.properties) {
    return event;
  }

  const props = event.properties;
  const rawAmount = Number(props[config.amountProperty]);
  if (!Number.isFinite(rawAmount)) {
    return event;
  }

  const isSubscription = props[config.subscriptionProperty] != null;
  const interval = props[config.intervalProperty];
  const currency = props[config.currencyProperty] != null ? props[config.currencyProperty] : config.defaultCurrency;
  const kind = rawAmount < 0 ? "refund" : isSubscription ? "subscription" : "oneoff";
  const monthlyMrr = isSubscription ? monthlyNormalized(rawAmount, interval) : 0;

  const ts = event.timestamp || props.timestamp || "";
  const periodMonth = typeof ts === "string" ? ts.slice(0, 7) : "";

  // Classify MRR movement vs this customer's last subscription amount.
  let movement = "none";
  let mrrDelta = 0;
  if (isSubscription) {
    const key = "rr_last_mrr:" + event.distinct_id;
    const previous = Number((await storage.get(key, 0)) || 0);
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

module.exports = { processEvent };
