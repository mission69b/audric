// Inline tool card used inside the hero + demo conversations.
// Ported from the `ToolCard` helper in `t2000-AFI/audric/AudricHero.jsx`.

import type { ReactNode } from "react";

interface ToolCardRow {
  l: string;
  v: ReactNode;
}

interface ToolCardProps {
  tag: string;
  rows: ToolCardRow[];
  footerLeft: ReactNode;
  footerRight: ReactNode;
}

export function ToolCard({ tag, rows, footerLeft, footerRight }: ToolCardProps) {
  return (
    <div className="au-tool-card">
      <div className="au-tool-card__header">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--fg-muted)",
          }}
        />
        <span>{tag}</span>
      </div>
      <div className="au-tool-card__body">
        {rows.map((r) => (
          <div className="au-tool-card__row" key={r.l}>
            <span>{r.l}</span>
            <strong>{r.v}</strong>
          </div>
        ))}
      </div>
      <div className="au-tool-card__footer">
        <span>{footerLeft}</span>
        <span>{footerRight}</span>
      </div>
    </div>
  );
}
