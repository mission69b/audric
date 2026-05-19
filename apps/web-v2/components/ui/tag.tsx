import type { ReactNode } from "react";

/**
 * Mono uppercase pill — Audric design-system Tag.
 *
 * Ported from `apps/web/components/ui/Tag.tsx`. Used by settings sections
 * (Passport zkLogin pill, Memory type tags, etc.). Kept as a tiny inline
 * component instead of using shadcn `Badge` because the design needs the
 * exact mono-font + tracking + tone palette wired to Audric tokens
 * (`bg-success-bg`, `text-info-fg`, etc.) — shadcn Badge would require
 * an override variant on top.
 */

export type TagTone = "neutral" | "green" | "red" | "blue" | "yellow";

export interface TagProps {
  tone?: TagTone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<TagTone, string> = {
  neutral: "bg-surface-sunken text-fg-secondary border border-border-subtle",
  green: "bg-success-bg text-success-fg border border-success-border/40",
  red: "bg-error-bg text-error-fg border border-error-border/40",
  blue: "bg-info-bg text-info-fg border border-info-border/40",
  yellow: "bg-warning-bg text-warning-fg border border-warning-border/40",
};

export function Tag({ tone = "neutral", children, className }: TagProps) {
  return (
    <span
      className={[
        "inline-flex select-none items-center whitespace-nowrap rounded-xs px-1.5 py-px font-mono text-[9px] uppercase leading-[14px] tracking-[0.1em]",
        TONE_CLASSES[tone],
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
