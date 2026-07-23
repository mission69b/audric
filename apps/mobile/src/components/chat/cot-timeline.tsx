import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  Brain,
  ChevronDown,
  ExternalLink,
  Globe,
  Loader,
  TriangleAlert,
} from "@/components/ui/icon";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { Markdown } from "./markdown";
import type { ChatMessage } from "@/lib/types";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// Chain-of-Thought timeline — the native port of web-v3's
// `components/chat/cot-timeline.tsx`. It folds the model's `reasoning` parts and
// `web_search` tool calls into ONE collapsible "how it got here" strip:
//
//   • live "Thinking…" while reasoning streams (the interleaved-thinking models —
//     Kimi K2.5 the free default — emit reasoning as they work),
//   • "Searching the web…" per `web_search` call — spinner → globe on completion,
//     the query, a result count, and tappable source rows,
//   • a "Thought / Worked for Xs · N steps" summary once the turn finishes.
//
// Collapsed by default, including while the turn streams — a deliberate
// divergence from web-v3, which auto-opens during the stream. On a phone the
// expanded trace pushes the answer off-screen exactly while the user is waiting
// for it; the shimmering header already says work is happening. Opening is one
// tap and the state sticks for that turn. The elapsed timer is anchored to the
// server-stamped `metadata.createdAt`; on history-reloaded turns that metadata is
// absent, so the seconds are simply omitted (the steps still render from the
// persisted parts).

type Step =
  | { kind: "reasoning"; text: string }
  | {
      kind: "search";
      query: string;
      sources: { url: string; title: string }[];
      active: boolean;
      error: boolean;
    };

// The runtime shape of a `web_search` tool part (see lib/ai/tools/web-search.ts:
// input `{ query }`, output `{ answer, sources: [{ url, title }] }`). Read via a
// cast because the client's `ChatMessage` doesn't carry the tool types.
type ToolPart = {
  state?: string;
  input?: { query?: string };
  output?: { sources?: { url?: string; title?: string }[] };
};

// Fold the message's parts into ordered timeline steps. Consecutive reasoning
// text is concatenated and flushed as one step before each search (so the
// narration reads in the order it happened).
function buildSteps(parts: ChatMessage["parts"]): Step[] {
  const steps: Step[] = [];
  let reasoning = "";
  const flush = () => {
    const t = reasoning.trim();
    if (t) steps.push({ kind: "reasoning", text: t });
    reasoning = "";
  };

  for (const part of parts) {
    if (part.type === "reasoning") {
      reasoning += part.text ?? "";
      continue;
    }
    // Compare on a widened string — the tool literal isn't in the default part
    // union, so a direct `=== "tool-web_search"` would be a no-overlap TS error.
    if ((part.type as string) === "tool-web_search") {
      flush();
      const t = part as unknown as ToolPart;
      const sources = (t.output?.sources ?? [])
        .filter((s): s is { url: string; title?: string } => Boolean(s?.url))
        .map((s) => ({
          url: s.url,
          title: typeof s.title === "string" ? s.title : "",
        }));
      steps.push({
        kind: "search",
        query: t.input?.query ?? "",
        sources,
        active: t.state !== "output-available" && t.state !== "output-error",
        error: t.state === "output-error",
      });
    }
  }
  flush();
  return steps;
}

function domainOf(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || url;
}

function openLink(url: string) {
  void WebBrowser.openBrowserAsync(url);
}

// A continuously rotating loader (the AI SDK / lucide `Loader`), the native
// equivalent of web-v3's spinning `Loader2Icon`. Animated transform, native
// driver — no re-render per frame.
function Spinner({ size, color }: { size: number; color: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Loader size={size} color={color} strokeWidth={2.2} />
    </Animated.View>
  );
}

export function CotTimeline({
  parts,
  streaming,
  createdAt,
}: {
  parts: ChatMessage["parts"];
  /** the turn is still streaming — drives auto-open + the live timer. */
  streaming: boolean;
  createdAt?: number;
}) {
  const { colors } = useTheme();
  const steps = useMemo(() => buildSteps(parts), [parts]);

  // Closed until the user asks for it. `null` = untouched (closed); a tap pins
  // it either way for the rest of the turn.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? false;

  // Elapsed timer, anchored to the server `createdAt`. Tick every 500ms while
  // streaming, then freeze at the last value.
  const [now, setNow] = useState(() => (createdAt ? createdAt : 0));
  useEffect(() => {
    if (!(streaming && createdAt)) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [streaming, createdAt]);
  const elapsed =
    createdAt && now > createdAt ? Math.round((now - createdAt) / 1000) : 0;

  if (steps.length === 0) return null;

  const hasSearch = steps.some((s) => s.kind === "search");
  const verb = hasSearch ? "Worked" : "Thought";
  const summary = streaming
    ? hasSearch
      ? "Researching…"
      : "Thinking…"
    : `${verb}${elapsed > 0 ? ` for ${elapsed}s` : ""} · ${steps.length} step${
        steps.length === 1 ? "" : "s"
      }`;

  return (
    <View style={[styles.card, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <Pressable
        onPress={() => setOverride(!open)}
        style={styles.header}
        hitSlop={6}
      >
        <Brain size={14} color={colors.tealLabel} strokeWidth={2} />
        {streaming ? (
          // web-v3 shimmers its live "Thinking..." label (components/chat/
          // message.tsx:688, `<Shimmer duration={1}>`); ShimmerText is the RN port.
          <ShimmerText
            text={summary}
            color={colors.fg}
            size={12.5}
            style={styles.summary}
          />
        ) : (
          <Text style={[styles.summary, { color: colors.fg }]}>{summary}</Text>
        )}
        <ChevronDown
          size={15}
          color={colors.mutedFg}
          strokeWidth={2}
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {steps.map((step, i) => {
            const key = `s${i}`;
            if (step.kind === "reasoning") {
              return (
                <View key={key} style={styles.step}>
                  <View style={styles.stepHead}>
                    <Brain size={13} color={colors.mutedFg} strokeWidth={2} />
                    <Text style={[styles.stepLabel, { color: colors.mutedFg }]}>
                      Thinking
                    </Text>
                  </View>
                  <View style={styles.reasoningBody}>
                    <Markdown
                      text={step.text}
                      color={colors.mutedFg}
                      size={13.5}
                    />
                  </View>
                </View>
              );
            }

            const label = step.error
              ? "Search unavailable"
              : step.active
                ? "Searching the web…"
                : "Searched the web";
            return (
              <View key={key} style={styles.step}>
                <View style={styles.stepHead}>
                  {step.active ? (
                    <Spinner size={13} color={colors.tealLabel} />
                  ) : step.error ? (
                    <TriangleAlert
                      size={13}
                      color={colors.warnFg}
                      strokeWidth={2}
                    />
                  ) : (
                    <Globe size={13} color={colors.tealLabel} strokeWidth={2} />
                  )}
                  <Text style={[styles.stepLabel, { color: colors.fg }]}>
                    {label}
                  </Text>
                  {!step.active && step.sources.length > 0 ? (
                    <Text style={[styles.count, { color: colors.mutedFg }]}>
                      {step.sources.length} source
                      {step.sources.length === 1 ? "" : "s"}
                    </Text>
                  ) : null}
                </View>

                {step.query ? (
                  <Text
                    style={[styles.query, { color: colors.mutedFg }]}
                    numberOfLines={2}
                  >
                    “{step.query}”
                  </Text>
                ) : null}

                {step.sources.map((src, si) => (
                  <Pressable
                    key={`${key}-${si}`}
                    onPress={() => openLink(src.url)}
                    style={styles.source}
                    hitSlop={4}
                  >
                    <ExternalLink
                      size={12}
                      color={colors.mutedFg}
                      strokeWidth={2}
                      style={styles.sourceIcon}
                    />
                    <Text
                      style={[styles.sourceTitle, { color: colors.secondaryFg }]}
                      numberOfLines={1}
                    >
                      {src.title || domainOf(src.url)}
                    </Text>
                    <Text
                      style={[styles.sourceDomain, { color: colors.mutedFg }]}
                      numberOfLines={1}
                    >
                      {domainOf(src.url)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  summary: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5 },
  body: {
    paddingHorizontal: 11,
    paddingBottom: 11,
    paddingTop: 2,
    gap: 12,
  },
  step: { gap: 5 },
  stepHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepLabel: { fontFamily: fonts.medium, fontSize: 12 },
  count: { fontFamily: fonts.regular, fontSize: 11 },
  reasoningBody: { paddingLeft: 19 },
  query: {
    paddingLeft: 19,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    fontStyle: "italic",
    lineHeight: 18,
  },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 19,
    paddingVertical: 2,
  },
  sourceIcon: { marginTop: 0 },
  sourceTitle: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 12.5 },
  sourceDomain: { fontFamily: fonts.regular, fontSize: 11 },
});
