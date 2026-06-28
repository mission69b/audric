"use client";

import { useEffect, useState } from "react";

type ApiModel = {
  id: string;
  name: string;
  tier: string;
  privacy: "private" | "confidential";
  context_window: number | null;
  pricing: { input_per_1m: number; output_per_1m: number };
};

function PrivacyBadge({ privacy }: { privacy: ApiModel["privacy"] }) {
  const confidential = privacy === "confidential";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ${
        confidential
          ? "bg-[var(--t2k-accent-hi)] text-[var(--accent)]"
          : "bg-[var(--ds-gray-alpha-400,rgba(255,255,255,0.06))] text-[var(--muted)]"
      }`}
    >
      {confidential ? "Confidential · TEE" : "Private · ZDR"}
    </span>
  );
}

export function ModelsSection() {
  const [models, setModels] = useState<ApiModel[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/models");
        if (res.ok) {
          const j = (await res.json()) as { data: ApiModel[] };
          setModels(j.data);
        }
      } catch {
        // transient
      }
    })();
  }, []);

  return (
    <div className="rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-5">
      <div className="text-[var(--dim)] text-xs uppercase tracking-wide">
        Models
      </div>
      <p className="mt-2 text-[var(--muted)] text-sm">
        Every model behind one key — private by default. Prices are USD per 1M
        tokens (what you pay).
      </p>

      {models && models.length > 0 ? (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-[var(--dim)] text-[11px] uppercase">
              <th className="pb-2 text-left font-medium">Model</th>
              <th className="pb-2 text-left font-medium">Privacy</th>
              <th className="pb-2 text-right font-medium">In / 1M</th>
              <th className="pb-2 text-right font-medium">Out / 1M</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr
                className="border-[var(--border-bright)] border-t align-top"
                key={m.id}
              >
                <td className="py-2">
                  <div className="text-[var(--foreground)]">{m.name}</div>
                  <div className="font-mono text-[11px] text-[var(--dim)]">
                    {m.id}
                  </div>
                </td>
                <td className="py-2">
                  <PrivacyBadge privacy={m.privacy} />
                </td>
                <td className="py-2 text-right text-[var(--muted)]">
                  ${m.pricing.input_per_1m.toFixed(2)}
                </td>
                <td className="py-2 text-right text-[var(--muted)]">
                  ${m.pricing.output_per_1m.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-[var(--muted)] text-sm">Loading catalog…</p>
      )}
    </div>
  );
}
