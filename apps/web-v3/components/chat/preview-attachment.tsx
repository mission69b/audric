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
  const typeLabel = isImage
    ? "Image"
    : contentType === "application/pdf"
      ? "PDF"
      : (displayName.split(".").pop()?.toUpperCase() ?? "File");

  // Images → square thumbnail. Files (PDF/doc) → a wide rectangular chip so the
  // full filename is readable (Venice-style), not truncated into a square.
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
            className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100"
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
      className="group relative flex h-14 w-60 shrink-0 items-center gap-2.5 overflow-hidden rounded-xl border border-border/40 bg-muted px-2.5"
      data-testid="input-attachment-preview"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/80">
        {isUploading ? (
          <Spinner className="size-4" />
        ) : (
          <FileTextIcon className="size-5 text-muted-foreground/70" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground text-xs">
          {displayName}
        </div>
        <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
          {typeLabel}
        </div>
      </div>
      {onRemove && !isUploading && (
        <button
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-foreground/70 opacity-0 transition-opacity hover:bg-black/20 group-hover:opacity-100 dark:bg-white/10 dark:hover:bg-white/20"
          onClick={onRemove}
          type="button"
        >
          <CrossSmallIcon size={10} />
        </button>
      )}
    </div>
  );
};
