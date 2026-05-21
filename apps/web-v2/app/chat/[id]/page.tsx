/**
 * `/chat/[id]` — click-to-resume page (v0.7e Persistent Chats Phase 3,
 * rewritten for P0-B fix).
 *
 * **Why this is a CLIENT page, not a server component.**
 *
 * The original Phase 3 implementation was a server component that
 * called `getCurrentUser()` to enforce private-chat ownership. That
 * helper reads `x-zklogin-jwt` from request headers — but RSC document
 * navigations (sidebar `<Link>` click, refresh of `/chat/[id]`) never
 * send custom headers. zkLogin JWT lives in `localStorage` and only
 * rides on `authFetch` `fetch()` calls. Result: every private-chat
 * resume returned 404 for the actual owner.
 *
 * The fix moves hydration to a client component that fetches from
 * `GET /api/chat/[id]` via `authFetch`, which DOES attach the JWT
 * header. The API endpoint enforces the same ownership rules.
 *
 * **Three branches once hydrated:**
 *   - Private + owner          → render `<AudricChatClient>` with messages
 *   - Public  + owner          → render `<AudricChatClient>` with messages
 *   - Public  + non-owner      → redirect to `/share/[id]` (read-only)
 *   - (Private + non-owner)    → API returned 404; the loading branch shows the branded 404
 *   - (Unauthenticated)        → API returned 401; authFetch fires
 *     `zklogin:expired` event so the global auth handler shows the sign-in
 *     splash.
 */

"use client";

import type { UIMessage } from "ai";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { authFetch } from "@/lib/auth-fetch";
import { AudricChatClient } from "../audric-chat-client";

type HydrationResult =
  | { state: "loading" }
  | {
      state: "ready";
      chatId: string;
      messages: UIMessage[];
      visibility: "private" | "public";
    }
  | { state: "not-found" }
  | { state: "redirect-share" };

export default function ChatByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { address } = useZkLogin();
  const [result, setResult] = useState<HydrationResult>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await authFetch(`/api/chat/${id}`);
        if (cancelled) {
          return;
        }
        if (res.status === 404) {
          setResult({ state: "not-found" });
          return;
        }
        if (!res.ok) {
          // 401 → authFetch already fired zklogin:expired (handled
          // globally). 500 → fall through to not-found UX.
          setResult({ state: "not-found" });
          return;
        }
        const body = (await res.json()) as {
          chat: {
            id: string;
            visibility: "private" | "public";
            userId: string;
          };
          messages: UIMessage[];
        };
        if (cancelled) {
          return;
        }

        // [P1-D] Public chat + viewer is not the owner → redirect to
        // the read-only share viewer. The live composer would render
        // for them but every POST to /api/chat would 403, so the
        // composer would be a dead end. /share/[id] is the right
        // surface for non-owners.
        if (body.chat.visibility === "public" && body.chat.userId !== address) {
          setResult({ state: "redirect-share" });
          router.replace(`/share/${id}`);
          return;
        }

        setResult({
          state: "ready",
          chatId: body.chat.id,
          messages: body.messages,
          visibility: body.chat.visibility,
        });
      } catch {
        if (!cancelled) {
          setResult({ state: "not-found" });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, address, router]);

  if (result.state === "loading" || result.state === "redirect-share") {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  if (result.state === "not-found") {
    // Trigger Next's not-found boundary via a thrown rerender. We
    // intentionally don't call `notFound()` from `next/navigation`
    // here (that's a server-only API); rendering the same JSX as
    // `not-found.tsx` keeps the UX consistent.
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
        <a
          className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 font-medium text-primary-foreground text-sm shadow-sm hover:bg-primary/90"
          href="/chat"
        >
          Back to Audric
        </a>
      </div>
    );
  }

  return (
    <AudricChatClient
      chatId={result.chatId}
      initialMessages={result.messages}
      initialVisibility={result.visibility}
    />
  );
}
