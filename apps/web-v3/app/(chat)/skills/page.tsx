"use client";

/**
 * Skills — the browse/discovery surface (AGENT_WEDGE §3a). Lists Audric's live
 * data skills by category; tapping an example PASTES it into the composer
 * (`?draft=` → use-active-chat pre-fills `input`, no auto-send) so the user can
 * tweak it before sending. The agent ALSO auto-routes to these from natural
 * language — this page just makes them visible + tappable.
 */

import { PencilLineIcon, SparklesIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { SKILLS, type SkillDef } from "@/lib/skills/catalog";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function SkillCard({ skill }: { skill: SkillDef }) {
  const router = useRouter();

  const tryExample = (prompt: string) => {
    router.push(`${BASE_PATH}/?draft=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="flex flex-col rounded-2xl border border-border/50 bg-card/40 p-5 transition-shadow hover:shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2">
        <SparklesIcon className="size-4 text-muted-foreground" />
        <h3 className="font-medium text-foreground">{skill.name}</h3>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
          {skill.category}
        </span>
        <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 uppercase tracking-wide dark:text-emerald-400">
          Free
        </span>
      </div>
      <p className="mt-2 text-muted-foreground/80 text-xs leading-relaxed">
        {skill.description}
      </p>

      <div className="mt-auto flex flex-col gap-1.5 pt-4">
        {skill.examples.map((example) => (
          <button
            className="group flex items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
            key={example}
            onClick={() => tryExample(example)}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">{example}</span>
            <PencilLineIcon className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const router = useRouter();
  // The chat is a persistent shell in the (chat) layout, so this route renders
  // as an overlay over the content area (the sidebar stays usable).
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="mb-1 flex items-center gap-2">
          <SparklesIcon className="size-5 text-foreground" />
          <h1 className="font-semibold text-foreground text-xl">Skills</h1>
          <button
            aria-label="Back to chat"
            className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => router.push(`${BASE_PATH}/`)}
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <p className="mb-8 text-muted-foreground text-sm">
          Live data skills Audric can use — free, and built right into chat.
          Just ask naturally and Audric picks the right one, or tap an example
          to drop it into the composer and tweak it before sending.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SKILLS.map((skill) => (
            <SkillCard key={skill.slug} skill={skill} />
          ))}
        </div>
      </div>
    </div>
  );
}
