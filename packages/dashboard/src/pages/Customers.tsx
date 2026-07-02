import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthMetrics } from "@revenue-recipes/core";
import { Card, SectionTitle, StatTile } from "../components/ui.js";
import { compactMonth, currency, percent } from "../lib/format.js";

export function Customers({ series, latest }: { series: MonthMetrics[]; latest: MonthMetrics }) {
  const data = series.map((m) => ({
    month: compactMonth(m.month),
    Active: m.activeCustomers,
    New: m.newCustomers,
    Churned: m.churnedCustomers,
    arpu: m.arpu,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="ARPU" value={currency(latest.arpu)} sub="revenue / active user (latest month)" />
        <StatTile
          label="LTV"
          value={latest.ltv === null ? "—" : currency(latest.ltv)}
          sub={latest.ltv === null ? "no churn in latest month" : "ARPU / churn rate"}
        />
        <StatTile label="Churn rate" value={percent(latest.churnRate)} sub="churned / prior-active" />
        <StatTile label="Active subscriptions" value={String(latest.activeSubscriptions)} />
      </div>

      <Card>
        <SectionTitle>Customers &amp; ARPU by month</SectionTitle>
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} width={40} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => currency(v)} tick={{ fontSize: 12 }} width={72} />
            <Tooltip />
            <Legend />
            <Bar yAxisId="left" dataKey="Active" fill="#6366f1" />
            <Bar yAxisId="left" dataKey="New" fill="#22c55e" />
            <Bar yAxisId="left" dataKey="Churned" fill="#ef4444" />
            <Line yAxisId="right" type="monotone" dataKey="arpu" name="ARPU" stroke="#0f172a" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
