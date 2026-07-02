import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { evaluateGoal, type Goal, type MonthMetrics, type RevenueDataset } from "@revenue-recipes/core";
import { Card, SectionTitle, StatTile } from "../components/ui.js";
import { compactMonth, currency, percent } from "../lib/format.js";

export function Overview({
  series,
  latest,
  period,
  dataset,
}: {
  series: MonthMetrics[];
  latest: MonthMetrics;
  period: MonthMetrics;
  dataset: RevenueDataset;
}) {
  const chartData = series.map((m) => ({ month: compactMonth(m.month), mrr: m.mrr, arr: m.arr }));
  const mrrGoals: { goal: Goal; current: number; met: boolean }[] = dataset.goals
    .filter((g) => g.metric === "mrr")
    .map((g) => evaluateGoal(g, latest))
    .filter((s) => s.visible);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="MRR" value={currency(latest.mrr)} sub={`as of ${latest.month}`} />
        <StatTile label="ARR (run rate)" value={currency(latest.arr)} sub="MRR × 12" />
        <StatTile label="Active customers" value={String(latest.activeCustomers)} sub={`${latest.activeSubscriptions} subscriptions`} />
        <StatTile label="Gross revenue" value={currency(period.grossRevenue)} sub="selected period, incl. one-off + refunds" />
      </div>

      <Card>
        <SectionTitle>MRR over time</SectionTitle>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => currency(v)} tick={{ fontSize: 12 }} width={72} />
            <Tooltip formatter={(v: number) => currency(v)} />
            {mrrGoals.map((g) => (
              <ReferenceLine
                key={g.goal.id}
                y={g.goal.target}
                stroke={g.met ? "#10b981" : "#f59e0b"}
                strokeDasharray="6 4"
                label={{ value: `${g.goal.label}: ${currency(g.goal.target)}`, position: "insideTopRight", fontSize: 11 }}
              />
            ))}
            <Area type="monotone" dataKey="mrr" stroke="#6366f1" fill="url(#mrrFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {dataset.goals.length > 0 && (
        <Card>
          <SectionTitle>Revenue goals</SectionTitle>
          <div className="space-y-4">
            {dataset.goals.map((g) => {
              const s = evaluateGoal(g, latest);
              const pct = Math.min(1, s.progress);
              return (
                <div key={g.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{g.label} <span className="text-muted">({g.metric.toUpperCase()})</span></span>
                    <span className={s.met ? "text-emerald-600" : s.overdue ? "text-rose-600" : "text-muted"}>
                      {currency(s.current)} / {currency(g.target)} · {percent(s.progress)}
                      {s.overdue && !s.met ? " · overdue" : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${s.met ? "bg-emerald-500" : s.overdue ? "bg-rose-500" : "bg-accent"}`}
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
