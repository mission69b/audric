import { escrowEconomyStats } from "@audric/accounts";
import { fetchRailStats } from "./gateway-services";

// THE canonical "Settled USDC" composition — escrow releases (event-indexed
// EscrowJob ledger) + per-call x402 volume (rail payment log). Every surface
// that shows a settled number renders THIS total: the store homepage,
// /activity, /api/economy (which t2000.ai's metrics band consumes). The two
// components live in different ledgers, so this is the only place they meet.
export type EconomyStats = {
  /** Per-call x402 volume the rail logged (proxied + chain-verified direct). */
  railVolumeUsd: number;
  railPayments: number;
  /** Escrow releases, from the event-indexed job ledger. */
  escrowSettledUsd: number;
  totalJobs: number;
  distinctWallets: number;
  /** escrowSettledUsd + railVolumeUsd — the one settled number. */
  totalSettledUsd: number;
  /** Which ledgers answered — callers render "—" when both are down. */
  hasRail: boolean;
  hasEscrow: boolean;
};

export async function getEconomyStats(): Promise<EconomyStats> {
  const [econ, rail] = await Promise.all([
    escrowEconomyStats().catch(() => null),
    fetchRailStats(),
  ]);
  const escrowSettledUsd = econ ? econ.settledMicroUsdc / 1_000_000 : 0;
  const railVolumeUsd = rail ? Number.parseFloat(rail.totalVolume) || 0 : 0;
  return {
    railVolumeUsd,
    railPayments: rail?.totalPayments ?? 0,
    escrowSettledUsd,
    totalJobs: econ?.totalJobs ?? 0,
    distinctWallets: econ?.distinctWallets ?? 0,
    totalSettledUsd: escrowSettledUsd + railVolumeUsd,
    hasRail: rail !== null,
    hasEscrow: econ !== null,
  };
}
