"use client";

import { useState } from "react";

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
    <div className="rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between">
        <div className="text-[var(--dim)] text-xs uppercase tracking-wide">
          Quickstart
        </div>
        <div className="flex gap-1">
          {SNIPPETS.map((s) => (
            <button
              className={`rounded-md px-2 py-1 text-[12px] transition-colors ${
                tab === s.id
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              key={s.id}
              onClick={() => setTab(s.id)}
              type="button"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-[var(--muted)] text-sm">
        OpenAI-compatible. Create a key above, then drop it in — first call in
        under a minute.
      </p>

      <div className="relative mt-3">
        <button
          className="absolute top-2 right-2 rounded-md border border-[var(--border-bright)] bg-[var(--background)] px-2 py-1 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          onClick={copy}
          type="button"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <pre className="overflow-x-auto rounded-lg border border-[var(--border-bright)] bg-[var(--background)] p-4 font-mono text-[12px] text-[var(--foreground)] leading-relaxed">
          <code>{active.code}</code>
        </pre>
      </div>
    </div>
  );
}
