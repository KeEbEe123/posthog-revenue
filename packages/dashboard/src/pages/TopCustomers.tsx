import { useMemo } from "react";
import {
  churnRiskAccounts,
  topCustomers,
  type DateRange,
  type MonthMetrics,
  type RevenueDataset,
} from "@revenue-recipes/core";
import { Card, SectionTitle } from "../components/ui.js";
import { currency, percent } from "../lib/format.js";

export function TopCustomers({
  dataset,
  range,
  latest,
}: {
  dataset: RevenueDataset;
  range: DateRange;
  latest: MonthMetrics;
}) {
  const top = useMemo(() => topCustomers(dataset, range, 15), [dataset, range]);
  const risk = useMemo(() => churnRiskAccounts(dataset, latest.month), [dataset, latest.month]);

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Top customers by revenue</SectionTitle>
        <p className="mb-3 text-sm text-muted">
          Ranked by deferred revenue in the period — multi-month lump sums are split
          proportionally across the months they cover.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-muted">
                <th className="py-2 pr-4 font-medium">#</th>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 text-right font-medium">Revenue (period)</th>
              </tr>
            </thead>
            <tbody>
              {top.map((c, i) => (
                <tr key={c.customerId} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-muted">{i + 1}</td>
                  <td className="py-2 pr-4 font-medium">{c.name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{currency(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionTitle>Churn-risk accounts</SectionTitle>
        <p className="mb-3 text-sm text-muted">
          Still paying, but their MRR contracted versus the prior period — an early
          warning before they churn outright.
        </p>
        {risk.length === 0 ? (
          <div className="text-sm text-muted">No contracting accounts this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-muted">
                  <th className="py-2 pr-4 font-medium">Customer</th>
                  <th className="py-2 pr-4 text-right font-medium">Prev MRR</th>
                  <th className="py-2 pr-4 text-right font-medium">Current MRR</th>
                  <th className="py-2 pr-4 text-right font-medium">Drop</th>
                </tr>
              </thead>
              <tbody>
                {risk.map((r) => (
                  <tr key={r.customerId} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium">{r.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{currency(r.previous)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{currency(r.current)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-rose-600">{percent(r.dropPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
