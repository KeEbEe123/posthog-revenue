import type { DataSource } from "../datasource.js";
import type {
  Customer,
  DateRange,
  Goal,
  RevenueEvent,
  Subscription,
} from "../types.js";
import { monthKey } from "../metrics.js";
import { demoRange, generateDataset, type GenerateOptions } from "./generate.js";

/** DataSource backed by the deterministic seeded generator. Zero config. */
export class DemoSource implements DataSource {
  private readonly data = generateDataset(this.opts);

  constructor(private readonly opts: GenerateOptions = {}) {}

  async getCustomers(): Promise<Customer[]> {
    return this.data.customers;
  }

  async getSubscriptions(): Promise<Subscription[]> {
    return this.data.subscriptions;
  }

  async getRevenueEvents(range: DateRange): Promise<RevenueEvent[]> {
    const start = monthKey(range.start);
    const end = monthKey(range.end);
    return this.data.revenueEvents.filter((e) => {
      const m = monthKey(e.timestamp);
      return m >= start && m <= end;
    });
  }

  async getGoals(): Promise<Goal[]> {
    return this.data.goals;
  }
}

export { demoRange };
