"use client";

// Design segmented control (agents.css pattern used in ServiceDeployBlock,
// BillingPanel, the tasks modal): overlay track, white active pill. Shared
// across the store + console — one app, one control.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-[3px]"
      style={{
        background: "var(--ag-overlay)",
        borderColor: "var(--ag-border)",
      }}
    >
      {options.map((o) => (
        <button
          className="rounded-md px-3.5 py-1.5 font-medium text-[12.5px] transition-colors"
          key={o.id}
          onClick={() => onChange(o.id)}
          style={
            value === o.id
              ? { background: "#fff", color: "#0a0a0a" }
              : { background: "transparent", color: "var(--fg-muted)" }
          }
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
