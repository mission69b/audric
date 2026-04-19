// [PHASE 13] Marketing — landing page shell.
//
// This file used to be a 480-line monolith inlining the entire public
// marketing site. Phase 13 decomposed it into self-contained section
// components in `@/components/landing/*`. The page itself is now a thin
// composition that:
//
//   1. Mounts the marketing nav, sections, and footer in document order.
//   2. Preserves the auth-redirect: if the user is already authenticated,
//      we replace their URL with `/new` so they land directly in the app.
//
// All existing CTAs continue to invoke `useZkLogin().login` from inside
// their owning section components — no behavior change vs. pre-Phase-13.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { MarketingNav } from '@/components/landing/MarketingNav';
import { HeroSection } from '@/components/landing/HeroSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { IntelligenceSection } from '@/components/landing/IntelligenceSection';
import { PassportSection } from '@/components/landing/PassportSection';
import { PaySection } from '@/components/landing/PaySection';
import { FinanceSection } from '@/components/landing/FinanceSection';
import { StoreSection } from '@/components/landing/StoreSection';
import { ProductScreenshotSection } from '@/components/landing/ProductScreenshotSection';
import { MetricsSection } from '@/components/landing/MetricsSection';
import { MarketingFooter } from '@/components/landing/MarketingFooter';

export default function LandingPage() {
  const router = useRouter();
  const { status } = useZkLogin();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/new');
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
