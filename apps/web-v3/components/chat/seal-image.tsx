"use client";

/**
 * Renders a Walrus+Seal (`walrus:…`) image ref. An `<img src>` can't decrypt,
 * so we POST the ref + the client's Seal session to /api/files/decrypt, get the
 * plaintext bytes, and render them as a blob: URL. Used wherever an image whose
 * url is a walrus ref is shown.
 */

import { useEffect, useState } from "react";
import { getSealSession } from "@/lib/seal-session";

export function SealImage({
  refUrl,
  alt,
  className,
}: {
  refUrl: string;
  alt?: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const { exported } = await getSealSession();
        const res = await fetch("/api/files/decrypt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ref: refUrl, exportedSessionKey: exported }),
        });
        if (!res.ok) {
          if (!cancelled) {
            setFailed(true);
          }
          return;
        }
        const blob = await res.blob();
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [refUrl]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-muted text-muted-foreground text-xs ${className ?? "size-40"}`}
      >
        Couldn't decrypt image
      </div>
    );
  }
  if (!src) {
    return (
      <div
        className={`animate-pulse rounded-lg bg-muted ${className ?? "size-40"}`}
      />
    );
  }
  // biome-ignore lint/performance/noImgElement: blob: URLs aren't supported by next/image.
  return <img alt={alt ?? "image"} className={className} src={src} />;
}
