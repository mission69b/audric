"use client";

/**
 * UsernamePaletteRoot — globally-mounted host for the username search
 * palette + its keyboard shortcut.
 *
 * Mounts inside the (chat) layout so the palette is available from
 * every chat surface (empty state, existing thread, artifact). Owns:
 *
 *   1. Open/close state (the palette is a singleton — only one can be
 *      open at a time, regardless of how many surfaces request it).
 *
 *   2. The `Cmd/Ctrl+K` global keyboard shortcut. The shortcut is
 *      idempotent — pressing it while open closes the palette (matches
 *      VSCode / Cursor / Linear command-palette convention).
 *
 *   3. The mention-insertion handler. Replaces a trailing `@…` partial
 *      in the composer input with the resolved `@username` token, or
 *      appends `@username` when no partial is present.
 *
 * Why pull this into a dedicated root component instead of mounting
 * inside `<ChatShell>`: ChatShell is busy. Keeping the palette + its
 * shortcut wiring beside the shell (not inside) means future surfaces
 * (e.g. the artifact composer) can register their own input refs
 * without coupling to ChatShell internals.
 *
 * Traceability: RUNBOOK_v07c_phase_6_cutover.md §4.7.E.
 */

import { useCallback, useEffect, useState } from "react";
import { useActiveChat } from "@/hooks/use-active-chat";
import { UsernameSearchPalette } from "./username-search-palette";

/**
 * Insert `@username` into the input string, replacing any trailing
 * `@partial` if present, otherwise appending with leading whitespace
 * separation when needed.
 *
 * Pure helper exported for unit testing — the behaviour matters across
 * cursor positions so we exercise it directly rather than through DOM.
 */
export function insertMention(current: string, username: string): string {
  const mention = `@${username}`;
  const match = current.match(/@([a-z0-9-]*)$/i);
  if (match) {
    return `${current.slice(0, match.index)}${mention} `;
  }
  if (current.length === 0) {
    return `${mention} `;
  }
  if (current.endsWith(" ") || current.endsWith("\n")) {
    return `${current}${mention} `;
  }
  return `${current} ${mention} `;
}

export function UsernamePaletteRoot() {
  const { setInput } = useActiveChat();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSelect = useCallback(
    (username: string) => {
      setInput((current) => insertMention(current, username));
      // Defer focus restoration until the dialog has fully unmounted —
      // shadcn restores focus to the trigger on close, but our trigger
      // is a keyboard shortcut (no DOM node), so we manually nudge the
      // composer back into focus on the next frame.
      requestAnimationFrame(() => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          '[data-testid="multimodal-input"]'
        );
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      });
    },
    [setInput]
  );

  return (
    <UsernameSearchPalette
      onOpenChange={setOpen}
      onSelect={handleSelect}
      open={open}
    />
  );
}
