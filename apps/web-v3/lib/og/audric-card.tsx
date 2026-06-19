import { ImageResponse } from "next/og";

/**
 * Shared Open Graph / Twitter card renderer for audric.ai (v3).
 *
 * Ported from web-v2's canonical card so the brand stays identical across
 * surfaces. #0A0A0A canvas, 16px inset hairline, AudricMark + "audric"
 * wordmark top-left, a teal status pill, a two-line Geist headline, a Geist
 * subtitle, and a Geist Mono footer with a divider. Fonts load from Google
 * Fonts at render time (`loadGoogleFont`), so nothing is vendored.
 */

const ACCENT = "#0ac7b4"; // Audric signal (= --ds-teal-900 / mpp accent)
const INK = "#ededed";
const MUTE = "#888888";
const SUB = "#999999";
const FOOT = "#666666";
const BG = "#0a0a0a";

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

async function loadGoogleFont(
  family: string,
  weight: number,
  text: string
): Promise<ArrayBuffer> {
  const url =
    `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}` +
    `:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (
    await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) like Gecko",
      },
    })
  ).text();
  const match = css.match(
    /src:\s*url\((.+?)\)\s+format\('(opentype|truetype|woff)'\)/
  );
  if (!match) {
    throw new Error(`Font ${family}@${weight}: font URL not found in CSS`);
  }
  const font = await fetch(match[1]);
  if (!font.ok) {
    throw new Error(`Font ${family}@${weight}: HTTP ${font.status}`);
  }
  return await font.arrayBuffer();
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
};

export function renderAudricCard({
  pill,
  line1,
  line2,
  subtitle,
  footerLeft = "audric.ai",
  footerRight = "",
}: AudricCardOptions): Promise<ImageResponse> {
  const glyphs = `audric${pill}${line1}${line2}${subtitle}${footerLeft}${footerRight}`;
  return Promise.all([
    loadGoogleFont("Geist", 400, glyphs),
    loadGoogleFont("Geist", 600, glyphs),
    loadGoogleFont("Geist Mono", 400, glyphs),
  ]).then(
    ([sans400, sans600, mono400]) =>
      new ImageResponse(
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
              inset: 0,
              background:
                "radial-gradient(ellipse 520px 300px at 360px 300px, rgba(10,199,180,0.16) 0%, rgba(10,199,180,0) 70%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 16,
              top: 16,
              right: 16,
              bottom: 16,
              border: "1px solid rgba(255,255,255,0.06)",
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
            <svg height="53" viewBox="0 0 53 53" width="53">
              <title>Audric</title>
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
              border: "1px solid rgba(10,199,180,0.30)",
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
                color: ACCENT,
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
            <div style={{ display: "flex", color: INK }}>{line1}</div>
            <div style={{ display: "flex", color: MUTE }}>{line2}</div>
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
              <div style={{ width: 30, height: 1, background: "#444444" }} />
            ) : null}
            {footerRight ? (
              <div style={{ display: "flex" }}>{footerRight}</div>
            ) : null}
          </div>
        </div>,
        {
          ...OG_SIZE,
          fonts: [
            { name: "Geist", data: sans400, weight: 400, style: "normal" },
            { name: "Geist", data: sans600, weight: 600, style: "normal" },
            { name: "Geist Mono", data: mono400, weight: 400, style: "normal" },
          ],
        }
      )
  );
}
