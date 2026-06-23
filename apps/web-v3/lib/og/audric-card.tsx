import { ImageResponse } from "next/og";

/**
 * Shared Open Graph / Twitter card renderer for audric.ai (v3).
 *
 * Light canvas (#FFFFFF) so OG/Twitter share images read light across
 * surfaces. 16px inset hairline, AudricMark + "audric"
 * wordmark top-left, a teal status pill, a two-line Geist headline, a Geist
 * subtitle, and a Geist Mono footer with a divider. Fonts load from Google
 * Fonts at render time (`loadGoogleFont`), so nothing is vendored.
 */

// Light card aligned to og-audric-light.svg (the canonical reference).
const ACCENT = "#0ac7b4"; // bright teal — pill dot
const PILL_TEXT = "#0a9486"; // pill label teal
const INK = "#0a0a0a";
const MUTE = "#999999";
const SUB = "#666666";
const FOOT = "#999999";
const BG = "#ffffff";
const DIVIDER = "#cccccc";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

// AudricMark 9-cell diamond. 9px cells on an 11px pitch. Monochrome ink.
const CELLS: { x: number; y: number }[] = [
  { x: 22, y: 0 },
  { x: 11, y: 11 },
  { x: 33, y: 11 },
  { x: 0, y: 22 },
  { x: 22, y: 22 },
  { x: 44, y: 22 },
  { x: 11, y: 33 },
  { x: 33, y: 33 },
  { x: 22, y: 44 },
];

// Module-level cache so repeated crawls of the same page don't re-fetch.
const fontCache = new Map<string, ArrayBuffer>();

/**
 * Best-effort Google Font load. Returns null on ANY failure (timeout, network,
 * parse) — the OG image then renders with Satori's default font instead of
 * 500ing. The Google Fonts fetch was timing out (fonts.googleapis.com) and
 * breaking the share card (X showed no image); never let it crash the render.
 */
async function loadGoogleFont(
  family: string,
  weight: number,
  text: string
): Promise<ArrayBuffer | null> {
  const cacheKey = `${family}:${weight}:${text}`;
  const cached = fontCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  try {
    const url =
      `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}` +
      `:wght@${weight}&text=${encodeURIComponent(text)}`;
    const cssRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) like Gecko",
      },
      signal: AbortSignal.timeout(3000),
    });
    const css = await cssRes.text();
    const match = css.match(
      /src:\s*url\((.+?)\)\s+format\('(opentype|truetype|woff)'\)/
    );
    if (!match) {
      return null;
    }
    const font = await fetch(match[1], { signal: AbortSignal.timeout(3000) });
    if (!font.ok) {
      return null;
    }
    const data = await font.arrayBuffer();
    fontCache.set(cacheKey, data);
    return data;
  } catch {
    return null;
  }
}

type AudricCardOptions = {
  /** Footer segment left of the divider. Defaults to `audric.ai`. */
  footerLeft?: string;
  /** Footer segment right of the divider. Defaults to `Gasless on Sui`. */
  footerRight?: string;
  /** Headline line 1 (ink). */
  line1: string;
  /** Headline line 2 (muted gray). */
  line2: string;
  /** Teal status pill text, e.g. "PRIVATE · SUI". */
  pill: string;
  /** Supporting line under the headline. */
  subtitle: string;
  /** Emphasize line 2 (ink) over line 1 (muted) — for the marketing headline
   * where the payoff sits on line 2. Default: line 1 ink, line 2 muted. */
  emphasizeLine2?: boolean;
};

export function renderAudricCard({
  pill,
  line1,
  line2,
  subtitle,
  footerLeft = "audric.ai",
  footerRight = "",
  emphasizeLine2 = false,
}: AudricCardOptions): Promise<ImageResponse> {
  const glyphs = `audric${pill}${line1}${line2}${subtitle}${footerLeft}${footerRight}`;
  return Promise.all([
    loadGoogleFont("Geist", 400, glyphs),
    loadGoogleFont("Geist", 600, glyphs),
    loadGoogleFont("Geist Mono", 400, glyphs),
  ]).then(([sans400, sans600, mono400]) => {
    // Only pass fonts that actually loaded; if all timed out, render with the
    // default font rather than 500ing the share card.
    const fonts = [
      sans400 && {
        name: "Geist",
        data: sans400,
        weight: 400 as const,
        style: "normal" as const,
      },
      sans600 && {
        name: "Geist",
        data: sans600,
        weight: 600 as const,
        style: "normal" as const,
      },
      mono400 && {
        name: "Geist Mono",
        data: mono400,
        weight: 400 as const,
        style: "normal" as const,
      },
    ].filter((f): f is NonNullable<typeof f> => Boolean(f));
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          background: BG,
          position: "relative",
          display: "flex",
          fontFamily: "Geist",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 16,
            top: 16,
            right: 16,
            bottom: 16,
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 80,
            top: 76,
            display: "flex",
            alignItems: "center",
            gap: 22,
          }}
        >
          {/* NO <title> here — Satori renders an SVG <title> as visible
                (fuzzy) text over the mark. Keep this SVG title-less. */}
          <svg
            aria-label="Audric"
            height="53"
            role="img"
            viewBox="0 0 53 53"
            width="53"
          >
            {CELLS.map((c) => (
              <rect
                fill={INK}
                height={9}
                key={`${c.x}-${c.y}`}
                rx={2}
                width={9}
                x={c.x}
                y={c.y}
              />
            ))}
          </svg>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist",
              fontWeight: 600,
              fontSize: 30,
              color: INK,
              letterSpacing: "-1px",
            }}
          >
            audric
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 80,
            top: 250,
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 28,
            paddingLeft: 14,
            paddingRight: 16,
            borderRadius: 14,
            background: "rgba(10,199,180,0.10)",
            border: "1px solid rgba(10,199,180,0.35)",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: ACCENT,
            }}
          />
          <div
            style={{
              display: "flex",
              fontFamily: "Geist Mono",
              fontSize: 11,
              color: PILL_TEXT,
              letterSpacing: "1.5px",
            }}
          >
            {pill}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 80,
            top: 300,
            display: "flex",
            flexDirection: "column",
            fontFamily: "Geist",
            fontWeight: 600,
            fontSize: 72,
            lineHeight: 1.0,
            letterSpacing: "-3px",
          }}
        >
          <div style={{ display: "flex", color: emphasizeLine2 ? MUTE : INK }}>
            {line1}
          </div>
          <div style={{ display: "flex", color: emphasizeLine2 ? INK : MUTE }}>
            {line2}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 80,
            top: 476,
            display: "flex",
            maxWidth: 1000,
            fontFamily: "Geist",
            fontSize: 21,
            color: SUB,
            letterSpacing: "-0.4px",
          }}
        >
          {subtitle}
        </div>

        <div
          style={{
            position: "absolute",
            left: 80,
            top: 548,
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontFamily: "Geist Mono",
            fontSize: 16,
            color: FOOT,
            letterSpacing: "0.5px",
          }}
        >
          <div style={{ display: "flex" }}>{footerLeft}</div>
          {footerRight ? (
            <div style={{ width: 30, height: 1, background: DIVIDER }} />
          ) : null}
          {footerRight ? (
            <div style={{ display: "flex" }}>{footerRight}</div>
          ) : null}
        </div>
      </div>,
      { ...OG_SIZE, fonts }
    );
  });
}
