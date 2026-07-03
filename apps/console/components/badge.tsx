import type { ReactNode } from "react";

// Minimal dependency-free badge (the explorer doesn't pull radix/cva).
const VARIANTS = {
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive/10 text-destructive",
  outline: "border border-border bg-input/30 text-foreground",
} as const;

export function Badge({
  children,
  variant = "secondary",
}: {
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
}) {
  return (
    <span
      className={`inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs ${VARIANTS[variant]}`}
    >
      {children}
    </span>
  );
}
