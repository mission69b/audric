"use client";

import { CardShell } from "./primitives";
import { AddressBlock } from "./shared";

// SuinsResolution — `resolve_suins` tool renderer.
// [R6.4 / A4 — 2026-05-30] Rebuilt to the phase2 read-card spec
// (`phase2-read-cards.html` R13): CardShell + AddressBlock (gradient
// avatar / handle / short address / Verified tag). Resolution logic
// preserved from the prior inline-pill `apps/web` port.

interface SuinsResolutionProps {
  direction: "forward" | "reverse";
  query: string;
  address?: string | null;
  registered?: boolean;
  primary?: string | null;
  names?: string[];
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) {
    return addr;
  }
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function SuinsResolution(props: SuinsResolutionProps) {
  const { direction, query } = props;
  const isForward = direction === "forward";

  const isResolved = isForward
    ? props.registered === true && !!props.address
    : !!props.primary;

  // Forward: query is a handle → show the resolved 0x. Reverse: query is
  // a 0x → show its primary handle.
  const handle = isForward ? query : (props.primary ?? undefined);
  const address = isForward
    ? props.address
      ? truncateAddress(props.address)
      : query
    : truncateAddress(query);

  const fallbackText = isForward ? "not registered" : "no SuiNS name";
  const shortQuery = query.startsWith("0x") ? truncateAddress(query) : query;

  return (
    <CardShell live={isResolved} title={isForward ? "SuiNS" : "Address"}>
      {isResolved ? (
        <AddressBlock address={address} handle={handle} tag="verified" />
      ) : (
        <AddressBlock address={`${shortQuery} — ${fallbackText}`} />
      )}
    </CardShell>
  );
}
