import type {
  Customer,
  DateRange,
  Goal,
  RevenueDataset,
  RevenueEvent,
  Subscription,
} from "./types.js";

/**
 * The abstraction every backend implements. `demoSource` generates seeded
 * data; `posthogSource` reads a real PostHog project via the Query API.
 * Consumers (dashboard, MCP server) only ever depend on this interface.
 */
export interface DataSource {
  getCustomers(): Promise<Customer[]>;
  getSubscriptions(): Promise<Subscription[]>;
  getRevenueEvents(range: DateRange): Promise<RevenueEvent[]>;
  getGoals(): Promise<Goal[]>;
}

/** Convenience: pull an entire dataset for a range in one shot. */
export async function loadDataset(
  source: DataSource,
  range: DateRange,
): Promise<RevenueDataset> {
  const [customers, subscriptions, revenueEvents, goals] = await Promise.all([
    source.getCustomers(),
    source.getSubscriptions(),
    source.getRevenueEvents(range),
    source.getGoals(),
  ]);
  return { customers, subscriptions, revenueEvents, goals };
}
