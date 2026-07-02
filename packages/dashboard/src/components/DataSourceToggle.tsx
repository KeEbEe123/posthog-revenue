import { useState } from "react";
import type { SourceConfig } from "../lib/useRevenue.js";

/**
 * Toggle between seeded demo data and a live PostHog project. Credentials are
 * held in component state only — never written to disk, localStorage, or a
 * backend. Refreshing the page clears them.
 */
export function DataSourceToggle({
  config,
  onChange,
}: {
  config: SourceConfig;
  onChange: (c: SourceConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState("https://us.posthog.com");
  const [projectId, setProjectId] = useState("");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
        <button
          className={`rounded-md px-3 py-1.5 font-medium ${
            config.mode === "demo" ? "bg-accent text-white" : "text-muted hover:text-ink"
          }`}
          onClick={() => onChange({ mode: "demo" })}
        >
          Demo data
        </button>
        <button
          className={`rounded-md px-3 py-1.5 font-medium ${
            config.mode === "posthog" ? "bg-accent text-white" : "text-muted hover:text-ink"
          }`}
          onClick={() => setOpen(true)}
        >
          Connect PostHog
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Connect your PostHog project</h3>
            <p className="mt-1 text-sm text-muted">
              Stored in memory only — never persisted. Requires a personal API key with
              query access. (CORS may block browser requests to some hosts; the MCP server
              and Node clients are unaffected.)
            </p>
            <div className="mt-4 space-y-3">
              <Field label="Host" value={host} onChange={setHost} placeholder="https://us.posthog.com" />
              <Field label="Project ID" value={projectId} onChange={setProjectId} placeholder="12345" />
              <Field label="Personal API key" value={apiKey} onChange={setApiKey} placeholder="phx_..." password />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md px-4 py-2 text-sm font-medium text-muted hover:text-ink"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!projectId || !apiKey}
                onClick={() => {
                  onChange({ mode: "posthog", host, projectId, apiKey });
                  setOpen(false);
                }}
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  password,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  password?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
        type={password ? "password" : "text"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
