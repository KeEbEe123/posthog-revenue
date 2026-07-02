import { useEffect, useState } from "react";
import {
  DemoSource,
  PostHogSource,
  computePeriodMetrics,
  computeSeries,
  demoRange,
  loadDataset,
  type DataSource,
  type DateRange,
  type MonthMetrics,
  type RevenueDataset,
} from "@revenue-recipes/core";

export type SourceConfig =
  | { mode: "demo" }
  | { mode: "posthog"; host: string; projectId: string; apiKey: string };

export interface RevenueState {
  loading: boolean;
  error: string | null;
  dataset: RevenueDataset | null;
  series: MonthMetrics[];
  period: MonthMetrics | null;
  latest: MonthMetrics | null;
  range: DateRange | null;
}

/** Widest range covering all data (timestamps + subscription starts). */
function spanRange(data: RevenueDataset): DateRange {
  const dates = [
    ...data.revenueEvents.map((e) => e.timestamp),
    ...data.subscriptions.map((s) => s.periodStart),
  ].sort();
  if (dates.length === 0) return { start: "1970-01-01", end: "1970-01-01" };
  return { start: dates[0], end: dates[dates.length - 1] };
}

export function useRevenue(config: SourceConfig): RevenueState {
  const [state, setState] = useState<RevenueState>({
    loading: true,
    error: null,
    dataset: null,
    series: [],
    period: null,
    latest: null,
    range: null,
  });

  const key = JSON.stringify(config);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        let source: DataSource;
        let range: DateRange;
        if (config.mode === "posthog") {
          source = new PostHogSource({
            host: config.host,
            projectId: config.projectId,
            apiKey: config.apiKey,
          });
          range = { start: "2000-01-01", end: "2100-01-01" };
        } else {
          source = new DemoSource();
          range = demoRange();
        }

        const dataset = await loadDataset(source, range);
        const effectiveRange = config.mode === "posthog" ? spanRange(dataset) : range;
        const series = computeSeries(dataset, effectiveRange);
        const period = series.length ? computePeriodMetrics(dataset, effectiveRange) : null;
        const latest = series.length ? series[series.length - 1] : null;

        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            dataset,
            series,
            period,
            latest,
            range: effectiveRange,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false,
            error: err instanceof Error ? err.message : String(err),
            dataset: null,
            series: [],
            period: null,
            latest: null,
            range: null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
