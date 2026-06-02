"use client";

/**
 * Toaster — R6.11 (Batch A) phase2 restyle of the app's sonner toasts to
 * `phase2-batch-a.html` §3.
 *
 * This is a re-skin of the EXISTING sonner toaster (mounted in
 * `app/layout.tsx`), not a new surface. Every current caller
 * (`toast.success("…")` / `toast.error("…")` from VisibilityToggle,
 * SidebarHistory, delete-all-chats, vote thumbs, the chat client) keeps
 * working untouched — they just render in the calm Geist card aesthetic
 * with a per-type signal glyph instead of sonner's default `richColors`.
 *
 * Phase2 contract:
 *   - bottom-right, max 3 visible, 4s default (sonner default).
 *   - card surface + hairline border + soft shadow; sans title, mono sub.
 *   - glyph per type: success = cyan signal, warning = amber, error = red,
 *     info = neutral. (Error stickiness is a per-call option —
 *     `toast.error(msg, { duration: Number.POSITIVE_INFINITY })` — not
 *     forced here, to avoid rewriting every existing caller.)
 */

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

const GLYPH_BASE =
  "flex h-[18px] w-[18px] items-center justify-center rounded-full";

function SuccessGlyph() {
  return (
    <span className={`${GLYPH_BASE} bg-signal text-background`}>
      <svg
        aria-hidden="true"
        fill="none"
        height="10"
        viewBox="0 0 16 16"
        width="10"
      >
        <path
          d="M3.5 8.5L6.5 11.5L13 4.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    </span>
  );
}

function WarningGlyph() {
  return (
    <span className={`${GLYPH_BASE} bg-warning text-background`}>
      <svg
        aria-hidden="true"
        fill="none"
        height="10"
        viewBox="0 0 16 16"
        width="10"
      >
        <path
          d="M8 4V9M8 11V11.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    </span>
  );
}

function ErrorGlyph() {
  return (
    <span className={`${GLYPH_BASE} bg-destructive text-white`}>
      <svg
        aria-hidden="true"
        fill="none"
        height="10"
        viewBox="0 0 16 16"
        width="10"
      >
        <path
          d="M3 3l10 10M13 3L3 13"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    </span>
  );
}

function InfoGlyph() {
  return (
    <span
      className={`${GLYPH_BASE} border border-foreground/30 bg-accent text-foreground`}
    >
      <svg
        aria-hidden="true"
        fill="none"
        height="10"
        viewBox="0 0 16 16"
        width="10"
      >
        <circle cx="8" cy="5" fill="currentColor" r="1" />
        <path
          d="M8 8V12"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      </svg>
    </span>
  );
}

export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      closeButton
      icons={{
        success: <SuccessGlyph />,
        warning: <WarningGlyph />,
        error: <ErrorGlyph />,
        info: <InfoGlyph />,
      }}
      position="bottom-right"
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "system"}
      toastOptions={{
        classNames: {
          // `!pr-9` reserves room for the top-right close button so the
          // title/description never slide under it.
          toast:
            "group/toast !rounded-[10px] !border !border-border !bg-card !text-foreground !shadow-lg !gap-2.5 !py-3 !pl-3.5 !pr-9",
          title:
            "!font-sans !text-[13px] !font-normal !leading-snug !tracking-[-0.011em] !text-foreground",
          description:
            "!font-mono !text-[11px] !text-muted-foreground !tracking-[0.02em]",
          actionButton:
            "!font-mono !text-[11px] !tracking-[0.02em] !bg-transparent !text-foreground !border-b !border-foreground/30 !rounded-none !px-0 !pt-1",
          // Sonner pins the close button to a corner with an outward
          // `transform: translate(35%, -35%)`, so the X visibly overflowed
          // the card. Cancel that transform and place it inside, top-right,
          // border-less — matching phase2-batch-a §3.
          closeButton:
            "!left-auto !right-2.5 !top-2.5 ![transform:none] !size-5 !rounded !border-0 !bg-transparent !text-muted-foreground hover:!bg-accent hover:!text-foreground",
          icon: "!mr-0",
        },
      }}
      visibleToasts={3}
      {...props}
    />
  );
}
