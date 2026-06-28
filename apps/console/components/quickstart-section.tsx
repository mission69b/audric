"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BASE_URL = "https://api.t2000.ai/v1";

const SNIPPETS: { id: string; label: string; code: string }[] = [
  {
    id: "curl",
    label: "curl",
    code: `curl ${BASE_URL}/chat/completions \\
  -H "Authorization: Bearer $T2000_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-oss-120b",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
  },
  {
    id: "python",
    label: "Python",
    code: `from openai import OpenAI

client = OpenAI(
    base_url="${BASE_URL}",
    api_key="$T2000_API_KEY",
)

resp = client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)`,
  },
  {
    id: "ts",
    label: "TypeScript",
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${BASE_URL}",
  apiKey: process.env.T2000_API_KEY,
});

const resp = await client.chat.completions.create({
  model: "openai/gpt-oss-120b",
  messages: [{ role: "user", content: "Hello" }],
});
console.log(resp.choices[0].message.content);`,
  },
];

export function QuickstartSection() {
  const [tab, setTab] = useState(SNIPPETS[0].id);
  const [copied, setCopied] = useState(false);
  const active = SNIPPETS.find((s) => s.id === tab) ?? SNIPPETS[0];

  function copy() {
    navigator.clipboard.writeText(active.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Section
      description="OpenAI-compatible. Create a key, drop it in — first call in under a minute."
      title="Quickstart"
    >
      <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
        {SNIPPETS.map((s) => (
          <button
            className={cn(
              "rounded-md px-3 py-1 text-xs transition-colors",
              tab === s.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={s.id}
            onClick={() => setTab(s.id)}
            type="button"
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="relative mt-3">
        <Button
          className="absolute top-2 right-2"
          onClick={copy}
          size="sm"
          variant="outline"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
        <pre className="overflow-x-auto rounded-lg border border-border/50 bg-muted/40 p-4 font-mono text-[11px] text-foreground/90 leading-relaxed">
          <code>{active.code}</code>
        </pre>
      </div>
    </Section>
  );
}
