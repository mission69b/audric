/**
 * Branded 404 page (v0.7e Persistent Chats Phase 5 / S.247).
 *
 * Triggered by `notFound()` in:
 *   - `/chat/[id]/page.tsx` — chat doesn't exist OR caller doesn't own
 *     a private chat (404 instead of 403 — see page comment for why).
 *   - `/share/[id]/page.tsx` — chat doesn't exist OR isn't public.
 *
 * Renders a minimal Audric-themed message + "Back to chat" CTA. No
 * sidebar / chrome — the chat surface is private to authenticated
 * users, and exposing it on a 404 would create a flash-of-empty-
 * sidebar for users who hit a stale share link.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-background px-4 text-center text-foreground">
      <h1 className="font-display font-medium text-4xl text-foreground tracking-tight">
        Audric
      </h1>
      <p className="mt-6 text-foreground/70 text-lg">
        We couldn&apos;t find that chat.
      </p>
      <p className="mt-2 text-foreground/50 text-sm">
        It may have been deleted, made private, or never existed.
      </p>
      <Link className="mt-8" href="/chat">
        <Button size="lg" variant="default">
          Back to Audric
        </Button>
      </Link>
    </div>
  );
}
