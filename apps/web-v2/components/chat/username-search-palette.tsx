"use client";

/**
 * UsernameSearchPalette — `<CommandDialog>` for mention picking.
 *
 * Replaces the legacy `GlobalUsernameSearch` sidebar inline combobox
 * (apps/web/components/identity/GlobalUsernameSearch.tsx, 391 LoC).
 * The legacy version did three jobs at once (Audric directory lookup
 * + generic SuiNS resolution + 0x address echo) and exposed them via a
 * single dropdown anchored to the sidebar input.
 *
 * The web-v2 form factor narrows scope to ONE thing: insert an
 * `@username` reference into the composer. SuiNS / 0x check-balance
 * dispatch is gone — users can express "check balance for alex.sui"
 * directly to the agent (the agent handles the SuiNS resolve via its
 * tool stack and asks for confirmation). The palette only surfaces
 * Audric directory hits so the mention is always a verified handle.
 *
 * Open trigger: `Cmd/Ctrl+K` (registered globally in `<UsernamePaletteRoot>`)
 * Insert behavior: replaces any trailing `@…` partial in the input with
 *   the full `@username` token, OR appends `@username` when the cursor
 *   isn't on a partial.
 *
 * Traceability: RUNBOOK_v07c_phase_6_cutover.md §4.7.E + S.193.
 */

import { useCallback, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  type UsernameSearchHit,
  useUsernameSearch,
} from "@/hooks/use-username-search";

interface UsernameSearchPaletteProps {
  onOpenChange: (open: boolean) => void;
  /** Fired with the bare `username` (no `@` prefix, no `.audric.sui` suffix). */
  onSelect: (username: string) => void;
  open: boolean;
}

export function UsernameSearchPalette({
  onSelect,
  onOpenChange,
  open,
}: UsernameSearchPaletteProps) {
  const [query, setQuery] = useState("");
  const { hits, isSearching, hasQuery } = useUsernameSearch(query);

  const handleSelect = useCallback(
    (hit: UsernameSearchHit) => {
      onSelect(hit.username);
      onOpenChange(false);
      setQuery("");
    },
    [onSelect, onOpenChange]
  );

  return (
    <CommandDialog
      description="Find an Audric user and insert their @handle into the composer."
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
        }
      }}
      open={open}
      title="Mention an Audric user"
    >
      <CommandInput
        onValueChange={setQuery}
        placeholder="Search Audric users…"
        value={query}
      />
      <CommandList>
        {hasQuery && !isSearching && hits.length === 0 && (
          <CommandEmpty>
            No Audric user matches{" "}
            <span className="font-mono text-foreground">{query.trim()}</span>.
          </CommandEmpty>
        )}
        {!hasQuery && (
          <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
        )}
        {hits.length > 0 && (
          <CommandGroup heading="Audric users">
            {hits.map((hit) => (
              <CommandItem
                key={hit.address}
                onSelect={() => handleSelect(hit)}
                value={hit.username}
              >
                <span aria-hidden="true" className="text-base">
                  {"\u{1FAAA}"}
                </span>
                <span className="font-mono text-foreground">
                  {hit.fullHandle}
                </span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
                  Mention
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
