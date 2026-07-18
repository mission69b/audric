"use client";

import { useState } from "react";

// Reviews / Engagements / Transactions on the public agent profile (t2 ACP
// Phase 2 — SPEC_ACP_SUI §5.3). Pure arrangement: the panels arrive fully
// server-rendered; this component only switches which one shows.

export function ProfileTabs({
  tabs,
}: {
  tabs: {
    id: string;
    label: string;
    count?: number;
    content: React.ReactNode;
  }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div>
      <div
        className="flex gap-1 overflow-x-auto border-b"
        style={{ borderColor: "var(--ag-border)" }}
      >
        {tabs.map((t) => (
          <button
            className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 font-medium text-[13px] transition-colors ${
              t.id === active
                ? "border-[color:var(--fg)] text-foreground"
                : "border-transparent text-fg-subtle hover:text-fg-muted"
            }`}
            key={t.id}
            onClick={() => setActive(t.id)}
            type="button"
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-1.5 font-mono text-[10.5px] text-fg-subtle">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div className={t.id === active ? "pt-4" : "hidden"} key={t.id}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
