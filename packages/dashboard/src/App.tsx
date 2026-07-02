import { useState } from "react";
import { DataSourceToggle } from "./components/DataSourceToggle.js";
import { useRevenue, type SourceConfig } from "./lib/useRevenue.js";
import { Overview } from "./pages/Overview.js";
import { Breakdown } from "./pages/Breakdown.js";
import { Customers } from "./pages/Customers.js";
import { TopCustomers } from "./pages/TopCustomers.js";

type Tab = "overview" | "breakdown" | "customers" | "top";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "breakdown", label: "MRR Breakdown" },
  { id: "customers", label: "Customers" },
  { id: "top", label: "Top Customers" },
];

export function App() {
  const [config, setConfig] = useState<SourceConfig>({ mode: "demo" });
  const [tab, setTab] = useState<Tab>("overview");
  const state = useRevenue(config);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revenue Recipes</h1>
          <p className="text-sm text-muted">
            A composable replacement for PostHog&apos;s deprecated Revenue Analytics dashboard.
          </p>
        </div>
        <DataSourceToggle config={config} onChange={setConfig} />
      </header>

      <nav className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {config.mode === "posthog" && (
        <div className="mb-4 rounded-lg bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
          Connected to a live PostHog project (credentials held in memory only).
        </div>
      )}

      {state.loading && <div className="py-20 text-center text-muted">Loading revenue data…</div>}

      {state.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <div className="font-semibold">Couldn&apos;t load data</div>
          <div className="mt-1">{state.error}</div>
          <button
            className="mt-3 rounded-md bg-rose-600 px-3 py-1.5 text-white"
            onClick={() => setConfig({ mode: "demo" })}
          >
            Back to demo data
          </button>
        </div>
      )}

      {!state.loading && !state.error && state.latest && state.period && state.dataset && state.range && (
        <>
          {tab === "overview" && (
            <Overview
              series={state.series}
              latest={state.latest}
              period={state.period}
              dataset={state.dataset}
            />
          )}
          {tab === "breakdown" && <Breakdown series={state.series} />}
          {tab === "customers" && <Customers series={state.series} latest={state.latest} />}
          {tab === "top" && (
            <TopCustomers dataset={state.dataset} range={state.range} latest={state.latest} />
          )}
        </>
      )}

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-muted">
        Demo data is deterministic (seed 42), spanning 18 months. Metrics computed by
        <code className="mx-1 rounded bg-slate-100 px-1">@revenue-recipes/core</code>— the same
        engine behind the MCP server and PostHog app.
      </footer>
    </div>
  );
}
