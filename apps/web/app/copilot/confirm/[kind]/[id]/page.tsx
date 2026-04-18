"use client";

import { useRouter } from "next/navigation";

// [SIMPLIFICATION DAY 3] The Copilot confirm flow is removed.
// Pattern-detected proposals (scheduled actions) and one-shot Copilot
// suggestions are no longer surfaced to users. This route used to be the
// landing target for digest-email links and dashboard cards. We keep the
// route file so legacy URLs do not 404 — instead users land on a short
// explainer that points them back to chat. Day 8 deletes this directory
// entirely after the digest emails have aged out of inboxes.

export default function ConfirmPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted">
          AUDRIC HAS CHANGED
        </p>
        <h1 className="text-xl font-semibold">
          We&apos;ve simplified Audric
        </h1>
        <p className="text-sm text-muted leading-relaxed">
          Audric is now a chat-first agent for money. Automated suggestions
          and scheduled actions have been retired — just ask me what to do
          with your money and I&apos;ll handle it in conversation.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-2 px-4 py-2 rounded-md bg-foreground text-background text-sm hover:opacity-90 transition"
        >
          Open chat
        </button>
      </div>
    </div>
  );
}
