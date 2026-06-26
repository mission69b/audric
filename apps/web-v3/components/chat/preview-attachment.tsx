import { FileTextIcon } from "lucide-react";
import Image from "next/image";
import type { Attachment } from "@/lib/types";
import { Spinner } from "../ui/spinner";
import { CrossSmallIcon } from "./icons";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  const isImage = contentType?.startsWith("image");
  const displayName = (name ?? "file").split("/").pop() ?? "file";
  // Claude-style: no filename shown, just a short type badge.
  const typeLabel =
    contentType === "application/pdf"
      ? "PDF"
      : contentType === "text/plain"
        ? "PASTED"
        : (displayName.split(".").pop()?.toUpperCase() ?? "FILE");

  // Every attachment renders as a SQUARE card (Claude-style): images show the
  // thumbnail; files show a centered icon + a small type badge — no filename.
  if (isImage) {
    return (
      <div
        className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted"
        data-testid="input-attachment-preview"
      >
        {/* `unoptimized` is REQUIRED: session-gated private blobs
            (/api/files/blob). Next's optimizer fetches server-side without the
            user's auth cookie → 401→400. Unoptimized renders a plain <img> the
            browser loads directly, sending the cookie. */}
        <Image
          alt={name ?? "attachment"}
          className="size-full object-cover"
          height={96}
          src={url}
          unoptimized
          width={96}
        />
        {isUploading && (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm"
            data-testid="input-attachment-loader"
          >
            <Spinner className="size-5" />
          </div>
        )}
        {onRemove && !isUploading && (
          <button
            className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-100 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
            onClick={onRemove}
            type="button"
          >
            <CrossSmallIcon size={10} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="group relative flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-border/40 bg-muted"
      data-testid="input-attachment-preview"
    >
      {isUploading ? (
        <Spinner className="size-5" />
      ) : (
        <FileTextIcon className="size-7 text-muted-foreground/70" />
      )}
      <span className="rounded bg-background/70 px-1.5 py-0.5 font-medium text-[9px] text-muted-foreground uppercase tracking-wide">
        {typeLabel}
      </span>
      {onRemove && !isUploading && (
        <button
          className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/10 text-foreground/70 opacity-100 transition-opacity hover:bg-black/20 group-hover:opacity-100 [@media(hover:hover)]:opacity-0 dark:bg-white/10 dark:hover:bg-white/20"
          onClick={onRemove}
          type="button"
        >
          <CrossSmallIcon size={10} />
        </button>
      )}
    </div>
  );
};
