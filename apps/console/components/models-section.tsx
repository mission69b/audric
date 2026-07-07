"use client";

import { useEffect, useState } from "react";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";

type ApiModel = {
  id: string;
  name: string;
  tier: string;
  privacy: "private" | "confidential";
  context_window: number | null;
  pricing: { input_per_1m: number; output_per_1m: number };
};

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
    <Section description="USD per 1M tokens, metered to your credit.">
      {models && models.length > 0 ? (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-border border-b text-left text-[11px] text-muted-foreground uppercase tracking-wide">
              <th className="pb-2 font-medium">Model</th>
              <th className="pb-2 font-medium">Privacy</th>
              <th className="pb-2 text-right font-medium">In / 1M</th>
              <th className="pb-2 text-right font-medium">Out / 1M</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr
                className="border-border/50 border-b last:border-0"
                key={m.id}
              >
                <td className="py-2.5">
                  <div className="text-foreground">{m.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {m.id}
                  </div>
                </td>
                <td className="py-2.5">
                  {m.privacy === "confidential" ? (
                    <Badge variant="default">Confidential</Badge>
                  ) : (
                    <Badge variant="secondary">Private</Badge>
                  )}
                </td>
                <td className="py-2.5 text-right text-muted-foreground tabular-nums">
                  ${m.pricing.input_per_1m.toFixed(2)}
                </td>
                <td className="py-2.5 text-right text-muted-foreground tabular-nums">
                  ${m.pricing.output_per_1m.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">Loading catalog…</p>
      )}
    </Section>
  );
}
