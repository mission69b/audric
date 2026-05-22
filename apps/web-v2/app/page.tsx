// Marketing landing page. Ported from apps/web/app/page.tsx (originally
// PHASE 13 decomposition). 15 self-contained section components in
// `@/components/landing/*` mounted in document order.
//
// Auth-redirect: if the user is already authenticated, they're sent
// directly to `/chat` (web-v2's chat URL — apps/web used `/new` which
// is the legacy chat-shell that disappears with v0.7e Phase 5).
//
// All CTAs invoke `useZkLogin().login` from inside their section
// components — identical behavior to apps/web's marketing landing.
//
// [v0.7c Phase 6.5 / S.253 — 2026-05-22] Verbatim port; only diffs vs
// apps/web original: (1) `useZkLogin` import path is web-v2's
// kebab-case `use-zklogin` (hook export name + return shape identical);
// (2) authenticated redirect target is `/chat` not `/new`.

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { FinanceSection } from "@/components/landing/FinanceSection";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { IntelligenceSection } from "@/components/landing/IntelligenceSection";
import { MarketingFooter } from "@/components/landing/MarketingFooter";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { MetricsSection } from "@/components/landing/MetricsSection";
import { PassportSection } from "@/components/landing/PassportSection";
import { PaySection } from "@/components/landing/PaySection";
import { ProductScreenshotSection } from "@/components/landing/ProductScreenshotSection";
import { StoreSection } from "@/components/landing/StoreSection";

export default function LandingPage() {
  const router = useRouter();
  const { status } = useZkLogin();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/chat");
    }
  }, [status, router]);

  return (
    <div className="min-h-dvh bg-surface-page text-fg-primary">
      <MarketingNav />
      <HeroSection />
      <HowItWorksSection />
      <IntelligenceSection />
      <PassportSection />
      <PaySection />
      <FinanceSection />
      <StoreSection />
      <ProductScreenshotSection />
      <MetricsSection />
      <MarketingFooter />
    </div>
  );
}
