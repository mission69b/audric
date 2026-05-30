// Marketing landing page for audric.ai.
//
// [R6.7 full port — 2026-05-30] Rebuilt onto the canonical Audric homepage
// design (`t2000-AFI/audric/Audric*.jsx` + `audric.css`), ported to Next.js
// on web-v2's Geist DS substrate. Supersedes the earlier R6.7 token-sweep
// that left the old apps/web landing layout in place. 8 sections in document
// order; all marketing classes live in `./landing.css`, scoped under
// `.au-landing`.
//
// Auth-redirect: authenticated users go straight to `/chat`. Every "Open
// Audric" CTA invokes `useZkLogin().login` from inside its section.

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { AudricCloser } from "@/components/landing/AudricCloser";
import { AudricDemos } from "@/components/landing/AudricDemos";
import { AudricFooter } from "@/components/landing/AudricFooter";
import { AudricHero } from "@/components/landing/AudricHero";
import { AudricNav } from "@/components/landing/AudricNav";
import { AudricProducts } from "@/components/landing/AudricProducts";
import { AudricShowcase } from "@/components/landing/AudricShowcase";
import { AudricStack } from "@/components/landing/AudricStack";
import "./landing.css";

export default function LandingPage() {
  const router = useRouter();
  const { status } = useZkLogin();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/chat");
    }
  }, [status, router]);

  return (
    <div className="au-landing">
      <AudricNav />
      <AudricHero />
      <AudricShowcase />
      <AudricDemos />
      <AudricProducts />
      <AudricStack />
      <AudricCloser />
      <AudricFooter />
    </div>
  );
}
