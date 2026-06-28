"use client";

import {
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@t2000/ui";
import { useCallback, useEffect, useState } from "react";

type UsageRow = {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
};

type Window = "24h" | "30d";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

function fmtSpend(micros: number): string {
  if (micros <= 0) {
    return "$0.00";
  }
  if (micros >= 10_000) {
    return `$${(Math.floor(micros / 10_000) / 100).toFixed(2)}`;
  }
  return `$${(Math.floor(micros / 100) / 10_000).toFixed(4)}`;
}

export function UsageSection() {
  const [window, setWindow] = useState<Window>("30d");
  const [rows, setRows] = useState<UsageRow[] | null>(null);

  const load = useCallback(async (w: Window) => {
    try {
      const res = await fetch(`/api/usage?window=${w}`);
      if (res.ok) {
        const j = (await res.json()) as { rows: UsageRow[] };
        setRows(j.rows);
      }
    } catch {
      // transient
    }
  }, []);

  useEffect(() => {
    load(window);
  }, [load, window]);

  const totalSpend = (rows ?? []).reduce((s, r) => s + r.costMicros, 0);
  const totalReq = (rows ?? []).reduce((s, r) => s + r.requests, 0);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-8">
            <div>
              <div className="text-muted-foreground text-xs uppercase">
                Spend
              </div>
              <div className="font-semibold text-foreground text-xl">
                {fmtSpend(totalSpend)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">
                Requests
              </div>
              <div className="font-semibold text-foreground text-xl">
                {totalReq}
              </div>
            </div>
          </div>
          <Tabs onValueChange={(v) => setWindow(v as Window)} value={window}>
            <TabsList>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {rows && rows.length === 0 ? (
          <p className="mt-6 text-muted-foreground text-sm">
            No API usage in this window yet. Make a call with your key to see it
            here.
          </p>
        ) : null}

        {rows && rows.length > 0 ? (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Reqs</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.model}>
                  <TableCell className="font-mono text-xs">{r.model}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {r.requests}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmtTokens(r.inputTokens + r.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmtSpend(r.costMicros)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
