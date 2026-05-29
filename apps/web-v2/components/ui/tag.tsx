import type { ReactNode } from "react";

/**
 * Mono uppercase pill — Audric design-system Tag.
 *
 * Ported from `apps/web/components/ui/Tag.tsx`. Used by settings sections
 * (Passport zkLogin pill, Memory type tags, etc.). Kept as a tiny inline
 * component instead of using shadcn `Badge` because the design needs the
 * exact mono-font + tracking + tone palette wired to Geist DS tokens
 * (`bg-success/10`, `text-info`, etc.) — shadcn Badge would require
 * an override variant on top.
 */

export type TagTone = "neutral" | "green" | "red" | "blue" | "yellow";

export interface TagProps {
  tone?: TagTone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<TagTone, string> = {
  neutral: "bg-muted text-muted-foreground border border-border",
  green: "bg-success/10 text-success border border-success/40",
  red: "bg-destructive/10 text-destructive border border-destructive/40",
  blue: "bg-info/10 text-info border border-info/40",
  yellow: "bg-warning/10 text-warning border border-warning/40",
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
