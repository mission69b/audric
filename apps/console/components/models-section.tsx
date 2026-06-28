"use client";

import {
  Badge,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@t2000/ui";
import { useEffect, useState } from "react";

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
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm">
          Prices are USD per 1M tokens — what you pay (metered to your credit).
        </p>

        {models && models.length > 0 ? (
          <Table className="mt-4">
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
                    <div className="font-mono text-muted-foreground text-xs">
                      {m.id}
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.privacy === "confidential" ? (
                      <Badge className="border-transparent bg-accent/15 text-accent">
                        Confidential · TEE
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Private · ZDR</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    ${m.pricing.input_per_1m.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    ${m.pricing.output_per_1m.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="mt-4 text-muted-foreground text-sm">Loading catalog…</p>
        )}
      </CardContent>
    </Card>
  );
}
