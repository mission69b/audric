"use client";

/**
 * Inline generated-image render (Audric v3, ChatGPT-style — founder pref "B").
 * Generated images flow through the Artifacts subsystem (base64 in the Document,
 * not bloating message parts); this renders that image cleanly INLINE in the
 * chat bubble via the AI Elements Image component, with a download action.
 */

import { DownloadIcon } from "lucide-react";
import useSWR from "swr";
import { Image } from "@/components/ai-elements/image";
import type { Document } from "@/lib/db/schema";
import { fetcher } from "@/lib/utils";

const EMPTY_BYTES = new Uint8Array();

/** Clean "Creating image…" placeholder shown while the image generates (matches
 * the inline render's box) — replaces the old artifact-card streaming state. */
export function InlineImageLoading() {
  return (
    <div className="flex aspect-square w-[min(100%,420px)] items-center justify-center rounded-xl border border-border/40 bg-muted/40">
      <span className="animate-pulse text-muted-foreground text-sm">
        Creating image…
      </span>
    </div>
  );
}

export function InlineImage({
  documentId,
  title,
  versionIndex,
}: {
  documentId: string;
  title?: string;
  // Which version this message produced (createDocument = 0; each edit = its
  // own index). Pins history so editing doesn't mutate earlier messages.
  versionIndex?: number;
}) {
  const { data: documents } = useSWR<Document[]>(
    documentId
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/document?id=${documentId}`
      : null,
    fetcher
  );

  // Versions come back ascending by createdAt. Render the version THIS message
  // produced (pinned by index); fall back to the latest if no pin is given.
  const pinned =
    typeof versionIndex === "number" ? documents?.[versionIndex] : undefined;
  const content = (pinned ?? documents?.at(-1))?.content;
  if (!content) {
    return (
      <div className="h-64 w-[min(100%,420px)] animate-pulse rounded-xl bg-muted" />
    );
  }

  const onDownload = () => {
    const link = window.document.createElement("a");
    link.href = `data:image/png;base64,${content}`;
    link.download = `${(title ?? "image").replace(/[^\w-]+/g, "-").toLowerCase()}.png`;
    link.click();
  };

  return (
    <div className="group relative w-[min(100%,420px)]">
      <Image
        alt={title ?? "Generated image"}
        base64={content}
        className="w-full rounded-xl border border-border/40"
        mediaType="image/png"
        uint8Array={EMPTY_BYTES}
      />
      <button
        aria-label="Download image"
        className="absolute right-2 bottom-2 rounded-md bg-black/50 p-1.5 text-white/90 opacity-0 backdrop-blur-sm transition-all hover:bg-black/70 group-hover:opacity-100"
        onClick={onDownload}
        type="button"
      >
        <DownloadIcon className="size-4" />
      </button>
    </div>
  );
}
