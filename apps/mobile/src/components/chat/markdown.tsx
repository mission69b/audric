import { type ReactNode, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// A small, self-contained Markdown renderer for assistant answers + reasoning
// bodies. web-v3 renders model output through Streamdown (markdown + GFM + code
// highlight + math + mermaid); on native we render the CHAT SUBSET that actually
// shows up in answers — headings, bold/italic/strike, inline + fenced code,
// bullet/numbered lists, blockquotes, links, horizontal rules. Deliberately
// dependency-free: no react-native-markdown package (unmaintained peer-dep churn
// against React 19) and no native module, so it runs in Expo Go unchanged.
//
// It re-parses on every render. That is fine here: chat messages are short, and
// re-parsing each streamed frame keeps the partial markdown rendering live (the
// same "format as it streams" feel web-v3 has). Math/mermaid/syntax-highlighting
// are intentionally out of scope — they degrade to plain code/text, never crash.

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: { num: string; text: string }[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "hr" }
  | { kind: "p"; text: string };

const RE = {
  fence: /^\s*```/,
  fenceOpen: /^\s*```(.*)$/,
  blank: /^\s*$/,
  hr: /^\s*([-*_])(?:\s*\1){2,}\s*$/,
  heading: /^\s{0,3}(#{1,6})\s+(.*)$/,
  quote: /^\s*>\s?/,
  ul: /^\s*[-*+]\s+/,
  ol: /^\s*\d+[.)]\s+/,
  olItem: /^\s*(\d+)[.)]\s+(.*)$/,
  // GFM table: any row containing a pipe, plus the |---|:--:| delimiter that
  // makes it a table rather than prose with a pipe in it.
  tableRow: /\|/,
  tableDivider: /^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/,
};

// "| a | b |" → ["a", "b"]. Leading/trailing pipes are optional in GFM.
function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

// Split source into block-level nodes. A line's leading token decides its block;
// paragraphs greedily absorb following plain lines until a blank line or a new
// block token.
function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  // A header row only starts a table when the NEXT line is the |---| divider, so
  // an ordinary sentence containing a pipe stays a paragraph.
  const isTableStart = (n: number) =>
    n + 1 < lines.length &&
    RE.tableRow.test(lines[n]) &&
    RE.tableDivider.test(lines[n + 1]);

  const isBlockStart = (l: string, n: number) =>
    RE.blank.test(l) ||
    RE.fence.test(l) ||
    RE.heading.test(l) ||
    RE.quote.test(l) ||
    RE.ul.test(l) ||
    RE.ol.test(l) ||
    isTableStart(n);

  while (i < lines.length) {
    const line = lines[i];

    const open = line.match(RE.fenceOpen);
    if (open) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !RE.fence.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // consume the closing fence (if any)
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }

    if (RE.blank.test(line)) {
      i++;
      continue;
    }

    if (RE.hr.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    const h = line.match(RE.heading);
    if (h) {
      blocks.push({
        kind: "heading",
        level: h[1].length,
        text: h[2].replace(/\s+#+\s*$/, "").trim(),
      });
      i++;
      continue;
    }

    if (RE.quote.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && RE.quote.test(lines[i])) {
        buf.push(lines[i].replace(RE.quote, ""));
        i++;
      }
      blocks.push({ kind: "quote", text: buf.join("\n") });
      continue;
    }

    if (RE.ul.test(line)) {
      const items: string[] = [];
      while (i < lines.length && RE.ul.test(lines[i])) {
        items.push(lines[i].replace(RE.ul, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    if (RE.ol.test(line)) {
      const items: { num: string; text: string }[] = [];
      let m: RegExpMatchArray | null;
      while (i < lines.length && (m = lines[i].match(RE.olItem))) {
        items.push({ num: m[1], text: m[2] });
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    if (isTableStart(i)) {
      const head = splitTableRow(line);
      i += 2; // header + divider
      const rows: string[][] = [];
      while (i < lines.length && RE.tableRow.test(lines[i])) {
        const cells = splitTableRow(lines[i]);
        // Pad/trim to the header width so a ragged row can't shift the columns.
        rows.push(
          Array.from({ length: head.length }, (_, c) => cells[c] ?? "")
        );
        i++;
      }
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    const buf: string[] = [line];
    i++;
    while (i < lines.length && !isBlockStart(lines[i], i)) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "p", text: buf.join(" ") });
  }

  return blocks;
}

// One pass over inline text, emitting styled <Text> spans. Single level (no
// nesting) — enough for chat. Order matters: links and `code` are matched before
// emphasis so a URL or code span isn't chewed up by `*`/`_`.
const INLINE =
  /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|~~([^~]+)~~|\*([^*\n]+)\*|_([^_\n]+)_/g;

function openLink(url: string) {
  void WebBrowser.openBrowserAsync(url);
}

function renderInline(
  text: string,
  s: ReturnType<typeof useStyles>,
  keyBase: string
): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  // biome-ignore lint/suspicious/noAssignInExpressions: exec loop
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${k++}`;
    if (m[1] !== undefined) {
      const url = m[2];
      out.push(
        <Text key={key} style={s.link} onPress={() => openLink(url)}>
          {m[1]}
        </Text>
      );
    } else if (m[3] !== undefined || m[4] !== undefined) {
      out.push(
        <Text key={key} style={s.bold}>
          {m[3] ?? m[4]}
        </Text>
      );
    } else if (m[5] !== undefined) {
      out.push(
        <Text key={key} style={s.codeInline}>
          {m[5]}
        </Text>
      );
    } else if (m[6] !== undefined) {
      out.push(
        <Text key={key} style={s.strike}>
          {m[6]}
        </Text>
      );
    } else {
      out.push(
        <Text key={key} style={s.italic}>
          {m[7] ?? m[8]}
        </Text>
      );
    }
    last = INLINE.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const HEADING_SIZE = [21, 19, 17, 15.5, 15, 15] as const;

// Per-column table widths, estimated from the longest cell. Inline markers
// (**bold**, `code`) are stripped first so they don't inflate the count. A cell
// longer than the cap still wraps — the shared width keeps the grid aligned when
// it does.
const CELL_MIN_W = 64;
const CELL_MAX_W = 260;
const CELL_PAD_W = 22; // paddingHorizontal * 2, see `td`
function columnWidths(
  head: string[],
  rows: string[][],
  size: number
): number[] {
  const plain = (c: string) => c.replace(/[*_`~]/g, "").length;
  // ~0.58em per character for the UI font at chat sizes; the header is semibold,
  // so it is measured a touch wider.
  const charW = (size - 1) * 0.58;
  return head.map((h, ci) => {
    const longest = rows.reduce(
      (max, r) => Math.max(max, plain(r[ci] ?? "")),
      plain(h) * 1.07
    );
    return Math.min(
      CELL_MAX_W,
      Math.max(CELL_MIN_W, Math.ceil(longest * charW) + CELL_PAD_W)
    );
  });
}

export function Markdown({
  text,
  color,
  size = 15,
}: {
  text: string;
  /** base text colour — defaults to the theme foreground. */
  color?: string;
  size?: number;
}) {
  const { colors } = useTheme();
  const base = color ?? colors.fg;
  const s = useStyles(base, size, colors);
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <View style={s.root}>
      {blocks.map((b, bi) => {
        const key = `b${bi}`;
        switch (b.kind) {
          case "heading":
            return (
              <Text
                key={key}
                style={[
                  s.heading,
                  { fontSize: HEADING_SIZE[b.level - 1] ?? size },
                ]}
              >
                {renderInline(b.text, s, key)}
              </Text>
            );
          case "code":
            return (
              <View key={key} style={s.codeBlock}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.codeScroll}
                >
                  <Text style={s.codeText}>{b.text}</Text>
                </ScrollView>
              </View>
            );
          case "quote":
            return (
              <View key={key} style={s.quote}>
                <Text style={s.quoteText}>{renderInline(b.text, s, key)}</Text>
              </View>
            );
          case "ul":
            return (
              <View key={key} style={s.list}>
                {b.items.map((it, ii) => (
                  <View key={`${key}-${ii}`} style={s.li}>
                    <Text style={s.bullet}>•</Text>
                    <Text style={s.liText}>
                      {renderInline(it, s, `${key}-${ii}`)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "ol":
            return (
              <View key={key} style={s.list}>
                {b.items.map((it, ii) => (
                  <View key={`${key}-${ii}`} style={s.li}>
                    <Text style={s.olNum}>{it.num}.</Text>
                    <Text style={s.liText}>
                      {renderInline(it.text, s, `${key}-${ii}`)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "table": {
            // Every cell in a column gets the SAME width, so the grid stays
            // aligned row-to-row (intrinsic per-cell widths would stagger it).
            // Width is estimated from the column's longest cell — RN gives no
            // synchronous text measurement, and a measure-then-layout pass would
            // reflow on every streamed frame.
            const widths = columnWidths(b.head, b.rows, size);
            return (
              <View key={key} style={s.tableWrap}>
                {/* Horizontal scroll, like the code block: a 4-column table of
                    market caps is wider than a phone, and squeezing it to fit
                    makes the grid unreadable. */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    <View style={[s.tr, s.trHead]}>
                      {b.head.map((c, ci) => (
                        <View
                          key={`${key}-h${ci}`}
                          style={[
                            s.td,
                            { width: widths[ci] },
                            ci > 0 && s.tdDivider,
                          ]}
                        >
                          <Text style={s.thText}>
                            {renderInline(c, s, `${key}-h${ci}`)}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {b.rows.map((r, ri) => (
                      <View key={`${key}-r${ri}`} style={s.tr}>
                        {r.map((c, ci) => (
                          <View
                            key={`${key}-r${ri}c${ci}`}
                            style={[
                              s.td,
                              { width: widths[ci] },
                              ci > 0 && s.tdDivider,
                            ]}
                          >
                            <Text style={s.tdText}>
                              {renderInline(c, s, `${key}-r${ri}c${ci}`)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            );
          }
          case "hr":
            return <View key={key} style={s.hr} />;
          default:
            return (
              <Text key={key} style={s.p}>
                {renderInline(b.text, s, key)}
              </Text>
            );
        }
      })}
    </View>
  );
}

function useStyles(
  base: string,
  size: number,
  colors: ReturnType<typeof useTheme>["colors"]
) {
  return useMemo(
    () =>
      StyleSheet.create({
        root: { gap: 7 },
        p: {
          fontFamily: fonts.regular,
          fontSize: size,
          lineHeight: size * 1.5,
          color: base,
        },
        heading: {
          fontFamily: fonts.semibold,
          color: base,
          lineHeight: size * 1.6,
          marginTop: 2,
        },
        bold: { fontFamily: fonts.semibold, color: base },
        italic: { fontStyle: "italic", color: base },
        strike: { textDecorationLine: "line-through", color: base },
        link: {
          color: colors.tealLabel,
          textDecorationLine: "underline",
          fontFamily: fonts.regular,
        },
        codeInline: {
          fontFamily: fonts.mono,
          fontSize: size - 1.5,
          color: base,
          backgroundColor: colors.muted,
        },
        codeBlock: {
          backgroundColor: colors.muted,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          paddingVertical: 10,
        },
        codeScroll: { paddingHorizontal: 12 },
        codeText: {
          fontFamily: fonts.mono,
          fontSize: 12.5,
          lineHeight: 19,
          color: colors.secondaryFg,
        },
        quote: {
          flexDirection: "row",
          borderLeftWidth: 3,
          borderLeftColor: colors.teal,
          paddingLeft: 10,
        },
        quoteText: {
          flex: 1,
          fontFamily: fonts.regular,
          fontSize: size,
          lineHeight: size * 1.5,
          color: colors.mutedFg,
        },
        list: { gap: 4 },
        li: { flexDirection: "row", gap: 8 },
        bullet: {
          fontFamily: fonts.regular,
          fontSize: size,
          lineHeight: size * 1.5,
          color: colors.mutedFg,
        },
        olNum: {
          fontFamily: fonts.regular,
          fontSize: size,
          lineHeight: size * 1.5,
          color: colors.mutedFg,
          minWidth: 16,
        },
        liText: {
          flex: 1,
          fontFamily: fonts.regular,
          fontSize: size,
          lineHeight: size * 1.5,
          color: base,
        },
        tableWrap: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: 10,
          overflow: "hidden",
        },
        tr: {
          flexDirection: "row",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        // The header carries no top border (the wrapper's own edge is its rule).
        trHead: { borderTopWidth: 0, backgroundColor: colors.muted },
        // Width comes from `columnWidths` per column — see the table branch.
        td: {
          paddingVertical: 7,
          paddingHorizontal: 11,
          justifyContent: "center",
        },
        tdDivider: {
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderLeftColor: colors.border,
        },
        thText: {
          fontFamily: fonts.semibold,
          fontSize: size - 1,
          lineHeight: (size - 1) * 1.45,
          color: base,
        },
        tdText: {
          fontFamily: fonts.regular,
          fontSize: size - 1,
          lineHeight: (size - 1) * 1.45,
          color: base,
        },
        hr: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginVertical: 4,
        },
      }),
    [base, size, colors]
  );
}
