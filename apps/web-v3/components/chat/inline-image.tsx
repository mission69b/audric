"use client";

/**
 * Inline generated-image render + fullscreen lightbox (SPEC_AUDRIC_IMAGE_PIPELINE
 * §4.1). Generated images flow through the Artifacts subsystem (base64 in the
 * Document); this renders inline in the chat, click → a fullscreen viewer with
 * Close (built into the Dialog) · Copy · Download · Details (prompt + model).
 */

import { CopyIcon, DownloadIcon, InfoIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Image } from "@/components/ai-elements/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Document } from "@/lib/db/schema";
import { fetcher } from "@/lib/utils";

const EMPTY_BYTES = new Uint8Array();

/** Clean "Creating image…" placeholder shown while the image generates. */
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
  model,
}: {
  documentId: string;
  title?: string;
  // Which version this message produced (createDocument = 0; each edit = its
  // own index). Pins history so editing doesn't mutate earlier messages.
  versionIndex?: number;
  // The image model used — shown in the lightbox Details.
  model?: string;
}) {
  const { data: documents } = useSWR<Document[]>(
    documentId
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/document?id=${documentId}`
      : null,
    fetcher
  );
  const [showDetails, setShowDetails] = useState(false);

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

  const dataUrl = `data:image/png;base64,${content}`;
  const filename = `${(title ?? "image")
    .replace(/[^\w-]+/g, "-")
    .toLowerCase()
    .slice(0, 60)}.png`;

  const onDownload = () => {
    const link = window.document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.click();
  };

  const onCopy = async () => {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      toast.success("Image copied");
    } catch {
      toast.error("Couldn't copy the image");
    }
  };

  const iconBtn =
    "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <Dialog>
      <div className="group relative w-[min(100%,420px)]">
        <DialogTrigger asChild>
          <button className="block w-full cursor-zoom-in" type="button">
            <Image
              alt={title ?? "Generated image"}
              base64={content}
              className="w-full rounded-xl border border-border/40"
              mediaType="image/png"
              uint8Array={EMPTY_BYTES}
            />
          </button>
        </DialogTrigger>
        <button
          aria-label="Download image"
          className="absolute right-2 bottom-2 rounded-md bg-black/50 p-1.5 text-white/90 opacity-0 backdrop-blur-sm transition-all hover:bg-black/70 group-hover:opacity-100"
          onClick={onDownload}
          type="button"
        >
          <DownloadIcon className="size-4" />
        </button>
      </div>

      <DialogContent className="max-w-[92vw] gap-0 overflow-hidden border-border/40 p-0 sm:max-w-[880px]">
        <DialogTitle className="sr-only">
          {title ?? "Generated image"}
        </DialogTitle>
        {/* biome-ignore lint/performance/noImgElement: base64 data URL, not a remote asset */}
        <img
          alt={title ?? "Generated image"}
          className="max-h-[78vh] w-full bg-muted/30 object-contain"
          src={dataUrl}
        />
        <div className="flex items-center justify-between gap-2 border-border/30 border-t px-3 py-2">
          <button
            className="flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
            onClick={() => setShowDetails((v) => !v)}
            type="button"
          >
            <InfoIcon className="size-3.5" />
            Details
          </button>
          <div className="flex items-center gap-1">
            <button
              aria-label="Copy image"
              className={iconBtn}
              onClick={onCopy}
              type="button"
            >
              <CopyIcon className="size-4" />
            </button>
            <button
              aria-label="Download image"
              className={iconBtn}
              onClick={onDownload}
              type="button"
            >
              <DownloadIcon className="size-4" />
            </button>
          </div>
        </div>
        {showDetails && (
          <div className="space-y-1 border-border/30 border-t px-3 py-2 text-xs">
            <div className="text-muted-foreground">
              <span className="text-foreground/70">Prompt:</span> {title}
            </div>
            {model && (
              <div className="text-muted-foreground">
                <span className="text-foreground/70">Model:</span> {model}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
