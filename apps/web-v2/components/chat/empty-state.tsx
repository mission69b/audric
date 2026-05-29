"use client";

/**
 * EmptyState — replaces the chatbot template's `<Greeting>` with the
 * Audric Splash-B post-auth empty state.
 *
 * Layout (top-aligned, centered):
 *   <BalanceHero size="lg" />
 *   "Good morning, Alice"
 *   "earning $X/day · X.X% APY"  (only when dailyYield > 0)
 *
 * The chip bar sits BELOW the composer (rendered by `<ChatShell>`),
 * not inside the empty state — it stays visible during streaming turns
 * too, per the runbook §4.7.F.
 *
 * Portfolio data comes from the `usePortfolio` SWR hook (Session 4.7.A
 * pattern: single canonical fetcher, shared cache key, dedup window).
 * BalanceHero is only rendered once the first portfolio response
 * lands — pre-load we show just the greeting so the user never sees
 * "$0.00" if they actually have funds.
 *
 * First-name lookup uses `decodeJwtClaim(jwt, "name")` (no signature
 * verification — UI-only — server routes verify per request). When
 * decode fails or the user has no Google name claim, we fall back to
 * a name-less greeting.
 */

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { BalanceHero } from "@/components/ui/balance-hero";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useUserStatus } from "@/hooks/use-user-status";
import { decodeJwtClaim } from "@/lib/jwt-client";

/**
 * Time-of-day greeting deferred to client-mount.
 *
 * `new Date().getHours()` returns the *server* hour during SSR (Vercel
 * edge = UTC) and the *client* hour during hydration (user's local TZ).
 * Computing the greeting at render time produces a UTC-vs-local
 * mismatch and triggers React #418. We defer the calculation to a
 * post-mount `useEffect` so the SSR + first client render both produce
 * the neutral fallback ("Hello"), then upgrade to the time-of-day
 * greeting after hydration completes.
 */
function getTimeOfDay(date: Date): "morning" | "afternoon" | "evening" {
  const hour = date.getHours();
  if (hour < 12) {
    return "morning";
  }
  if (hour < 18) {
    return "afternoon";
  }
  return "evening";
}

function getFirstName(jwt: string | null): string | null {
  const fullName = decodeJwtClaim(jwt, "name");
  if (!fullName) {
    return null;
  }
  const first = fullName.split(" ")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

function fmtCompactUsd(n: number): string {
  if (n >= 1) {
    return `$${Math.floor(n).toLocaleString()}`;
  }
  if (n > 0) {
    return `$${n.toFixed(4)}`;
  }
  return "$0";
}

export function EmptyState() {
  const { address, session } = useZkLogin();
  const { data: portfolio } = usePortfolio(address);
  // [S.209 — 2026-05-20] Prefer the claimed Audric username for the
  // greeting (`Good evening, funkii`), fall back to Google first name
  // (`Good evening, Mike`), then to a name-less greeting. Matches the
  // sidebar's identity-resolution priority (sidebar-user-nav.tsx
  // surfaces `username@audric` first, falls back to truncated address).
  const { username } = useUserStatus(address, session?.jwt);
  const firstName = getFirstName(session?.jwt ?? null);
  const personalName = username ?? firstName ?? null;

  const [mountedDate, setMountedDate] = useState<Date | null>(null);
  useEffect(() => {
    setMountedDate(new Date());
  }, []);

  const timeOfDay = mountedDate ? getTimeOfDay(mountedDate) : null;
  const greetingBase = timeOfDay ? `Good ${timeOfDay}` : "Hello";
  const greeting = personalName
    ? `${greetingBase}, ${personalName}`
    : greetingBase;

  const subStats: string[] = [];
  if (portfolio?.estimatedDailyYield && portfolio.estimatedDailyYield > 0) {
    subStats.push(
      `earning ${fmtCompactUsd(portfolio.estimatedDailyYield)}/day`
    );
  }
  if (portfolio?.positions.savingsRate && portfolio.positions.savingsRate > 0) {
    subStats.push(`${(portfolio.positions.savingsRate * 100).toFixed(1)}% APY`);
  }

  return (
    <div className="flex flex-col items-center gap-7 px-4 pt-12">
      {portfolio && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 8 }}
          transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <BalanceHero
            available={portfolio.walletValueUsd}
            earning={portfolio.positions.savings}
            size="lg"
            total={portfolio.netWorthUsd}
          />
        </motion.div>
      )}

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
        initial={{ opacity: 0, y: 8 }}
        transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="mb-2 font-medium text-[18px] text-foreground tracking-[-0.022em]">
          {greeting}
        </p>
        {subStats.length > 0 && (
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
            {subStats.join(" · ")}
          </p>
        )}
      </motion.div>
    </div>
  );
}
