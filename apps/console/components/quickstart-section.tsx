"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Section } from "@/components/section";
import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";

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
  const [copied, setCopied] = useState<string | null>(null);

  function copy(id: string, code: string) {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Section
      description="OpenAI-compatible. Create a key, drop it in — first call in under a minute."
      title="Quickstart"
    >
      <Tabs defaultValue="curl">
        <TabsList>
          {SNIPPETS.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SNIPPETS.map((s) => (
          <TabsContent key={s.id} value={s.id}>
            <div className="relative">
              <Button
                className="absolute top-2 right-2"
                onClick={() => copy(s.id, s.code)}
                size="sm"
                variant="outline"
              >
                {copied === s.id ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
              <pre className="overflow-x-auto rounded-lg border border-border/40 bg-muted/40 p-4 font-mono text-[11px] text-foreground/90 leading-relaxed">
                <code>{s.code}</code>
              </pre>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </Section>
  );
}
