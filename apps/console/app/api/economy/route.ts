import { NextResponse } from "next/server";
import { getEconomyStats } from "@/lib/economy";

// Public economy stats — the single source of truth for "Settled USDC"
// across surfaces (t2000.ai metrics band reads this instead of summing rail
// stats itself, which is how the homepage showed $96 while the store showed
// $101.29).
export const revalidate = 300;

export async function GET() {
  const stats = await getEconomyStats();
  return NextResponse.json(stats, {
    headers: { "access-control-allow-origin": "*" },
  });
}
