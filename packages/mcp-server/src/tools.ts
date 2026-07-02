// Tool implementations. Pure async functions over @revenue-recipes/core —
// no MCP wiring here, so they're trivially testable (see test/tools.smoke.ts)
// and index.ts stays a thin adapter. No metric logic is duplicated.

import {
  DemoSource,
  PostHogSource,
  churnRiskAccounts,
  computePeriodMetrics,
  computeSeries,
  loadDataset,
  topCustomers,
  visibleGoals,
  type DataSource,
  type DateRange,
  type RevenueDataset,
} from "@revenue-recipes/core";

export type DataSourceName = "demo" | "posthog";

function resolveSource(name: DataSourceName): DataSource {
  return name === "posthog" ? new PostHogSource() : new DemoSource();
}

/** Widest range that covers all data (derived from the data itself, so it
 *  works for both the fixed demo window and a live PostHog project). */
function spanRange(data: RevenueDataset): DateRange {
  // Use timestamps + periodStart only. periodEnd is an EXCLUSIVE boundary, so
  // including it would add a phantom trailing month with no active data.
  const dates: string[] = [
    ...data.revenueEvents.map((e) => e.timestamp),
    ...data.subscriptions.map((s) => s.periodStart),
  ];
  if (dates.length === 0) return { start: "1970-01-01", end: "1970-01-01" };
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

/** Load everything and compute the full monthly series once. */
async function buildContext(name: DataSourceName) {
  const source = resolveSource(name);
  // Load over a very wide range so PostHog returns everything, then narrow.
  const wide: DateRange = { start: "2000-01-01", end: "2100-01-01" };
  const data = await loadDataset(source, wide);
  const range = spanRange(data);
  const series = computeSeries(data, range);
  return { data, range, series };
}

/** Take the trailing `period` months (or all) as a sub-range. */
function trailingRange(series: { month: string }[], period: number | "all"): DateRange {
  const months = series.map((m) => m.month);
  const n = period === "all" ? months.length : Math.min(period, months.length);
  const start = months[months.length - n];
  const end = months[months.length - 1];
  return { start: `${start}-01`, end: `${end}-28` };
}

export async function getRevenueSummary(args: {
  period?: number | "all";
  dataSource: DataSourceName;
}) {
  const { data, series } = await buildContext(args.dataSource);
  const range = trailingRange(series, args.period ?? 12);
  const metrics = computePeriodMetrics(data, range);
  const goals = visibleGoals(data.goals, metrics).map((g) => ({
    label: g.goal.label,
    metric: g.goal.metric,
    target: g.goal.target,
    current: g.current,
    met: g.met,
    overdue: g.overdue,
    progress: Math.round(g.progress * 100) / 100,
  }));
  return { range, metrics, goals };
}

export async function getMrrBreakdown(args: {
  period?: number | "all";
  dataSource: DataSourceName;
}) {
  const { series } = await buildContext(args.dataSource);
  const range = trailingRange(series, args.period ?? 12);
  const startM = range.start.slice(0, 7);
  const endM = range.end.slice(0, 7);
  const months = series.filter((m) => m.month >= startM && m.month <= endM);
  const totals = months.reduce(
    (acc, m) => ({
      newMrr: acc.newMrr + m.newMrr,
      expansion: acc.expansion + m.expansion,
      contraction: acc.contraction + m.contraction,
      churn: acc.churn + m.churn,
    }),
    { newMrr: 0, expansion: 0, contraction: 0, churn: 0 },
  );
  return {
    range,
    latestMrr: months[months.length - 1]?.mrr ?? 0,
    totals,
    byMonth: months.map((m) => ({
      month: m.month,
      mrr: m.mrr,
      newMrr: m.newMrr,
      expansion: m.expansion,
      contraction: m.contraction,
      churn: m.churn,
    })),
  };
}

export async function getTopCustomers(args: {
  period?: number | "all";
  limit?: number;
  dataSource: DataSourceName;
}) {
  const { data, series } = await buildContext(args.dataSource);
  const range = trailingRange(series, args.period ?? 12);
  return { range, customers: topCustomers(data, range, args.limit ?? 10) };
}

export async function getChurnRiskAccounts(args: { dataSource: DataSourceName }) {
  const { data, series } = await buildContext(args.dataSource);
  const asOf = series[series.length - 1]?.month;
  if (!asOf) return { asOfMonth: null, accounts: [] };
  return { asOfMonth: asOf, accounts: churnRiskAccounts(data, asOf) };
}
