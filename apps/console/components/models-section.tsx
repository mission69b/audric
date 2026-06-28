"use client";

import { useEffect, useState } from "react";
import { Section } from "@/components/section";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

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
    <Section
      description="Prices are USD per 1M tokens — what you pay, metered to your credit."
      title="Models"
    >
      {models && models.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Privacy</TableHead>
              <TableHead className="text-right">In / 1M</TableHead>
              <TableHead className="text-right">Out / 1M</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="text-foreground">{m.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {m.id}
                  </div>
                </TableCell>
                <TableCell>
                  {m.privacy === "confidential" ? (
                    <Badge className="border-transparent bg-accent/15 text-accent">
                      Confidential
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Private</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  ${m.pricing.input_per_1m.toFixed(2)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  ${m.pricing.output_per_1m.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-xs">Loading catalog…</p>
      )}
    </Section>
  );
}
