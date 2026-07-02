// DataSource backed by a real PostHog project via the Query API (HogQL).
//
// IMPORTANT (secrets): credentials are read from the passed config OR from env
// vars (POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID, POSTHOG_HOST). They are
// NEVER hardcoded and NEVER logged — errors deliberately omit the token.
//
// HONESTY: this is best-effort. PostHog does not prescribe a single revenue
// event schema, so the exact property names (amount, subscription id, period)
// are configurable and the queries below assume a conventional layout. Adapt
// `PostHogSourceConfig.properties` to your project. See README "What's stubbed".

import type { DataSource } from "../datasource.js";
import type {
  Customer,
  DateRange,
  Goal,
  RevenueEvent,
  RevenueKind,
  Subscription,
} from "../types.js";

export interface PostHogPropertyMap {
  /** Event name that carries revenue, e.g. "revenue" or "charge". */
  revenueEvent: string;
  /** Event property holding the charged amount. */
  amount: string;
  /** Event property holding the currency code. */
  currency: string;
  /** Event property flagging a subscription charge (presence => subscription). */
  subscriptionId: string;
  /** Event property holding coverage period start (optional). */
  periodStart: string;
  /** Event property holding coverage period end (optional). */
  periodEnd: string;
  /** Event property holding the billing interval ("month" | "year"). */
  interval: string;
}

export interface PostHogSourceConfig {
  host?: string;
  projectId?: string;
  apiKey?: string;
  properties?: Partial<PostHogPropertyMap>;
}

const DEFAULT_PROPS: PostHogPropertyMap = {
  revenueEvent: "revenue",
  amount: "amount",
  currency: "currency",
  subscriptionId: "subscription_id",
  periodStart: "period_start",
  periodEnd: "period_end",
  interval: "interval",
};

function fromEnv(key: string): string | undefined {
  // Guard: `process` is undefined in the browser (dashboard passes config).
  return typeof process !== "undefined" ? process.env?.[key] : undefined;
}

/** Add one billing interval to an ISO timestamp/date string, UTC. Exported for testing. */
export function addInterval(iso: string, interval: "month" | "year"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso; // defensive: pass through malformed dates
  const months = interval === "year" ? 12 : 1;
  const next = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
  return next.toISOString();
}

export class PostHogSource implements DataSource {
  private readonly host: string;
  private readonly projectId: string;
  private readonly apiKey: string;
  private readonly props: PostHogPropertyMap;

  constructor(config: PostHogSourceConfig = {}) {
    this.host = (config.host ?? fromEnv("POSTHOG_HOST") ?? "https://us.posthog.com").replace(/\/$/, "");
    this.projectId = config.projectId ?? fromEnv("POSTHOG_PROJECT_ID") ?? "";
    this.apiKey = config.apiKey ?? fromEnv("POSTHOG_PERSONAL_API_KEY") ?? "";
    this.props = { ...DEFAULT_PROPS, ...config.properties };

    if (!this.projectId || !this.apiKey) {
      throw new Error(
        "PostHogSource requires a project ID and personal API key " +
          "(pass in config or set POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY).",
      );
    }
  }

  /** Run a HogQL query and return the raw result rows. */
  private async query(hogql: string): Promise<any[]> {
    const url = `${this.host}/api/projects/${this.projectId}/query/`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
    });
    if (!res.ok) {
      // Never include the token in error output.
      throw new Error(`PostHog query failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { results?: any[] };
    return json.results ?? [];
  }

  async getCustomers(): Promise<Customer[]> {
    const rows = await this.query(
      `SELECT id, properties.name, created_at FROM persons LIMIT 100000`,
    );
    return rows.map((r) => ({
      id: String(r[0]),
      name: String(r[1] ?? r[0]),
      createdAt: String(r[2]),
    }));
  }

  async getRevenueEvents(range: DateRange): Promise<RevenueEvent[]> {
    const p = this.props;
    const rows = await this.query(
      `SELECT
         uuid,
         person_id,
         timestamp,
         toFloat(properties.${p.amount}) AS amount,
         properties.${p.currency} AS currency,
         properties.${p.subscriptionId} AS subscription_id,
         properties.${p.periodStart} AS period_start,
         properties.${p.periodEnd} AS period_end
       FROM events
       WHERE event = '${p.revenueEvent.replace(/'/g, "")}'
         AND timestamp >= toDateTime('${range.start}')
         AND timestamp <= toDateTime('${range.end}')
       LIMIT 1000000`,
    );
    return rows.map((r) => {
      const amount = Number(r[3] ?? 0);
      const subscriptionId = r[5] ? String(r[5]) : undefined;
      const kind: RevenueKind = amount < 0 ? "refund" : subscriptionId ? "subscription" : "oneoff";
      return {
        id: String(r[0]),
        customerId: String(r[1]),
        timestamp: String(r[2]),
        amount,
        kind,
        currency: r[4] ? String(r[4]) : undefined,
        subscriptionId,
        periodStart: r[6] ? String(r[6]) : undefined,
        periodEnd: r[7] ? String(r[7]) : undefined,
      };
    });
  }

  /**
   * Best-effort: derive subscription billing periods from subscription-kind
   * revenue events over a wide window. Projects with a dedicated subscription
   * model should override this. Returns [] rather than throwing if the schema
   * doesn't match.
   *
   * IMPORTANT (found via live testing, not theoretical): `max(timestamp)` is
   * the date of the *last charge*, not the date coverage ends. A monthly
   * charge pays for the month AFTER it fires, so treating period_end as
   * exactly the last charge date makes every subscription look churned the
   * instant there's no fresh event in the current month — even customers who
   * are still paying on schedule. We extend period_end by one billing
   * interval past the last charge so a subscription reads as active through
   * the period it actually paid for, and only churns once a full interval
   * passes with no renewal charge.
   */
  async getSubscriptions(): Promise<Subscription[]> {
    const p = this.props;
    try {
      const rows = await this.query(
        `SELECT
           properties.${p.subscriptionId} AS sub_id,
           person_id,
           min(timestamp) AS period_start,
           max(timestamp) AS period_end,
           avg(toFloat(properties.${p.amount})) AS amount,
           anyLast(properties.${p.interval}) AS billing_interval
         FROM events
         WHERE event = '${p.revenueEvent.replace(/'/g, "")}'
           AND notEmpty(toString(properties.${p.subscriptionId}))
         GROUP BY sub_id, person_id
         LIMIT 1000000`,
      );
      return rows.map((r) => {
        const interval: "month" | "year" = String(r[5] ?? "").toLowerCase() === "year" ? "year" : "month";
        const lastChargeAt = String(r[3]);
        return {
          id: String(r[0]),
          customerId: String(r[1]),
          periodStart: String(r[2]),
          // Coverage extends one billing interval past the last charge, not
          // exactly to it — see note above.
          periodEnd: addInterval(lastChargeAt, interval),
          amount: Number(r[4] ?? 0),
          interval,
          status: "active" as const,
          currency: "USD",
        };
      });
    } catch {
      return [];
    }
  }

  /** Goals are user-defined locally; PostHog has no goals concept to read. */
  async getGoals(): Promise<Goal[]> {
    return [];
  }
}
