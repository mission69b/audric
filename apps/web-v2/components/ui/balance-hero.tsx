/**
 * BalanceHero — the centered total/available/earning lockup that
 * anchors the chat empty state (Splash-B, Session 4.7.B).
 *
 * Direct port of `apps/web/components/ui/BalanceHero.tsx`, kebab-cased
 * to match the chatbot template convention (`message.tsx`, etc.).
 *
 * Two diffs from legacy:
 *   - Token classes use Tailwind utility classes that resolve through
 *     web-v2's globals.css (`text-fg-primary`, `text-fg-muted` etc.)
 *     — these design tokens were ported in Session 2.
 *   - No `num-display` / `num-tabular` / `label-mono` typography
 *     classes — web-v2's globals.css doesn't ship those. We use plain
 *     Tailwind sizes + tabular-nums for the numeric blocks.
 */

export type BalanceHeroSize = "lg" | "md";

export interface BalanceHeroProps {
  total: number;
  available: number;
  earning: number;
  size?: BalanceHeroSize;
  className?: string;
  /** Optional currency prefix; defaults to "$". */
  currencySymbol?: string;
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtUsdInt(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

const SIZE_CLASSES: Record<
  BalanceHeroSize,
  { total: string; eyebrow: string; gap: string }
> = {
  lg: {
    total: "text-[52px] leading-none",
    eyebrow: "text-[10px] tracking-[0.1em]",
    gap: "gap-2",
  },
  md: {
    total: "text-[32px] leading-[1.1]",
    eyebrow: "text-[9px] tracking-[0.1em]",
    gap: "gap-1.5",
  },
};

export function BalanceHero({
  total,
  available,
  earning,
  size = "lg",
  className,
  currencySymbol = "$",
}: BalanceHeroProps) {
  const sz = SIZE_CLASSES[size];

  return (
    <div
      className={[
        "flex flex-col items-center text-center",
        sz.gap,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p
        className={`font-normal tabular-nums tracking-[-0.015em] text-foreground ${sz.total}`}
      >
        {currencySymbol}
        {fmtUsd(total)}
      </p>
      <p
        className={`font-mono uppercase text-muted-foreground ${sz.eyebrow}`}
      >
        AVAILABLE{" "}
        <span className="tabular-nums tracking-normal">
          {currencySymbol}
          {fmtUsdInt(available)}
        </span>
        <span aria-hidden="true" className="mx-2 text-muted-foreground/50">
          ·
        </span>
        EARNING{" "}
        <span className="tabular-nums tracking-normal">
          {currencySymbol}
          {fmtUsdInt(earning)}
        </span>
      </p>
    </div>
  );
}
