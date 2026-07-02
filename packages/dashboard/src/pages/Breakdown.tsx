import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthMetrics } from "@revenue-recipes/core";
import { Card, SectionTitle, StatTile } from "../components/ui.js";
import { compactMonth, currency } from "../lib/format.js";

export function Breakdown({ series }: { series: MonthMetrics[] }) {
  // Positive contributions up, losses down, so the stack reads intuitively.
  const data = series.map((m) => ({
    month: compactMonth(m.month),
    New: m.newMrr,
    Expansion: m.expansion,
    Contraction: -m.contraction,
    Churn: -m.churn,
    mrr: m.mrr,
  }));

  const totals = series.reduce(
    (a, m) => ({
      newMrr: a.newMrr + m.newMrr,
      expansion: a.expansion + m.expansion,
      contraction: a.contraction + m.contraction,
      churn: a.churn + m.churn,
    }),
    { newMrr: 0, expansion: 0, contraction: 0, churn: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="New MRR" value={currency(totals.newMrr)} tone="up" />
        <StatTile label="Expansion" value={currency(totals.expansion)} tone="up" />
        <StatTile label="Contraction" value={currency(totals.contraction)} tone="down" />
        <StatTile label="Churn" value={currency(totals.churn)} tone="down" />
      </div>

      <Card>
        <SectionTitle>MRR movement by month</SectionTitle>
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={data} stackOffset="sign" margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => currency(v)} tick={{ fontSize: 12 }} width={72} />
            <Tooltip formatter={(v: number) => currency(Math.abs(v))} />
            <Legend />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar dataKey="New" stackId="mrr" fill="#6366f1" />
            <Bar dataKey="Expansion" stackId="mrr" fill="#22c55e" />
            <Bar dataKey="Contraction" stackId="mrr" fill="#f59e0b" />
            <Bar dataKey="Churn" stackId="mrr" fill="#ef4444" />
            <Line type="monotone" dataKey="mrr" name="Net MRR" stroke="#0f172a" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
