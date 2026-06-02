/**
 * Branded 404 page (v0.7e Persistent Chats Phase 5 / S.247).
 *
 * Root catch-all for any unmatched route, plus `notFound()` from:
 *   - `/chat/[id]/page.tsx` — chat doesn't exist OR caller doesn't own
 *     a private chat (404 instead of 403 — see page comment for why).
 *   - `/share/[id]/page.tsx` — chat doesn't exist OR isn't public.
 *
 * Copy is generic so it reads correctly for both a stale share link and a
 * random bad URL. Minimal + chrome-light by design (no sidebar): the chat
 * surface is private to authenticated users, and exposing it on a 404 would
 * create a flash-of-empty-sidebar for users who hit a stale link. Monochrome
 * to match the Audric DS (accent === foreground).
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-background px-4 text-center text-foreground">
      <span className="font-mono text-sm uppercase tracking-[0.18em] text-foreground/40">
        404
      </span>
      <h1 className="mt-5 font-display font-medium text-4xl text-foreground tracking-tight">
        Page not found.
      </h1>
      <p className="mt-4 max-w-sm text-foreground/60 text-base leading-relaxed">
        This page may have been moved, deleted, made private, or never existed.
      </p>
      <Link className="mt-8" href="/">
        <Button size="lg" variant="default">
          Back to Audric
        </Button>
      </Link>
    </div>
  );
}
