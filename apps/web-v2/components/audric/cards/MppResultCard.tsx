"use client";

/**
 * MppResultCard — generic, modality-based render of an `mpp_call` result
 * (Tier 0/1 ground-truth render).
 *
 * `mpp_call` can hit ANY of the gateway's Services, so there is no per-
 * Service card — that would be whack-a-mole at 3000 endpoints. Instead we
 * render by OUTPUT MODALITY, which generalizes to every Service with zero
 * per-Service code:
 *   - media URLs found anywhere in the body  → image / audio chips
 *   - everything else                         → the verbatim JSON response
 *
 * Why verbatim: for a finance agent, letting the LLM paraphrase priced /
 * factual data it fetched is a fidelity risk. This card shows exactly what
 * the Service returned (ground truth) next to whatever prose the model
 * writes — the numbers the user sees are the numbers that came back.
 */

import { useState } from "react";

interface MppCallOutput {
  status?: number;
  paid?: boolean;
  cost?: number;
  body?: unknown;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|flac|aac)(\?|#|$)/i;
const MAX_MEDIA = 8;
const MAX_DEPTH = 6;
const TRUNCATE_AT = 1400;

interface Media {
  images: string[];
  audio: string[];
}

// Deep-scan the response for media URLs (modality detection, not field-name
// matching — works regardless of which Service produced it).
function collectMedia(value: unknown, acc: Media, depth = 0): void {
  if (depth > MAX_DEPTH || acc.images.length + acc.audio.length >= MAX_MEDIA) {
    return;
  }
  if (typeof value === "string") {
    if (value.startsWith("data:image") || IMAGE_EXT.test(value)) {
      acc.images.push(value);
    } else if (value.startsWith("data:audio") || AUDIO_EXT.test(value)) {
      acc.audio.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMedia(item, acc, depth + 1);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectMedia(item, acc, depth + 1);
    }
  }
}

function prettyBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

export function MppResultCard({ output }: { output: unknown }) {
  const result = (output ?? {}) as MppCallOutput;
  const { body } = result;
  const [expanded, setExpanded] = useState(false);

  const media: Media = { images: [], audio: [] };
  collectMedia(body, media);

  const json = prettyBody(body);
  const isLong = json.length > TRUNCATE_AT;
  const shown = expanded || !isLong ? json : `${json.slice(0, TRUNCATE_AT)}\n…`;
  const hasBody = body !== undefined && body !== null && json.length > 0;

  return (
    <div className="my-3 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.06em]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true">✓</span>
          Service result
          {typeof result.status === "number" ? ` · ${result.status}` : ""}
        </span>
        <span>
          {result.paid
            ? `Paid${typeof result.cost === "number" ? ` $${result.cost.toFixed(2)}` : ""}`
            : "No charge"}
        </span>
      </div>

      {media.images.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {media.images.map((src) => (
            // biome-ignore lint/performance/noImgElement: Service-generated URLs are arbitrary external hosts — next/image needs configured domains, which doesn't scale to 3000 Services
            <img
              alt="Service output"
              className="max-h-48 rounded-md border border-border"
              key={src}
              src={src}
            />
          ))}
        </div>
      )}

      {media.audio.map((src) => (
        // biome-ignore lint/a11y/useMediaCaption: Service-generated audio has no caption track
        <audio className="mt-2.5 w-full" controls key={src} src={src}>
          <track kind="captions" />
        </audio>
      ))}

      {hasBody && (
        <div className="mt-2.5">
          <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background p-2.5 font-mono text-[11px] text-foreground leading-[1.5]">
            {shown}
          </pre>
          {isLong && (
            <button
              className="mt-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em] transition hover:text-foreground"
              onClick={() => setExpanded((prev) => !prev)}
              type="button"
            >
              {expanded ? "Show less" : "Show full response"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
