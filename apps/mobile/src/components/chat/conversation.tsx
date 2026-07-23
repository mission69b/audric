import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Pressable } from "react-native";
import { FOLLOWUPS } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import { type ChatMessage, messageText } from "@/lib/types";
import { CotTimeline } from "./cot-timeline";
import { Markdown } from "./markdown";
import {
  AudricMark,
  Check,
  Copy,
  Download,
  FileText,
  ImageIcon,
  Maximize2,
  Pencil,
  Play,
  Plus,
  ThumbsDown,
  ThumbsUp,
} from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts, radius, space } from "@/theme/tokens";

// The active conversation column (prototype "ACTIVE CONVERSATION"): every message
// as a user bubble or an assistant turn (worklog + wallet card / image / video /
// artifact / text, action row, and follow-ups under the final answer), followed
// by the thinking / media-loading placeholders. Rendered inside the shell's
// scroll view. 1:1 with the prototype markup.
export function Conversation() {
  const { messages, thinking, busy, pendingMedia } = useAppState();
  const lastIdx = messages.length - 1;

  return (
    <View style={styles.col}>
      {messages.map((m, i) =>
        m.role === "user" ? (
          <UserBubble key={m.id} text={messageText(m)} />
        ) : (
          <AssistantTurn
            key={m.id}
            m={m}
            // The final assistant turn is the live one while the request is in
            // flight — drives the Chain-of-Thought auto-open + elapsed timer.
            streaming={i === lastIdx && busy}
            // Follow-ups (which re-enter `send`) only show on the final answer once
            // the turn is fully done — not while it is still streaming/awaiting.
            showFollowups={i === lastIdx && !thinking && !busy}
          />
        )
      )}
      {thinking && !pendingMedia ? <ThinkingRow /> : null}
      {thinking && pendingMedia === "image" ? <MediaLoading kind="image" /> : null}
      {thinking && pendingMedia === "video" ? <MediaLoading kind="video" /> : null}
    </View>
  );
}

function Avatar() {
  const { colors } = useTheme();
  return (
    <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
      <AudricMark size={15} color={colors.fg} />
    </View>
  );
}

function UserBubble({ text }: { text: string }) {
  const { colors } = useTheme();
  const { setDraft } = useAppState();
  return (
    <View style={styles.userWrap}>
      <LinearGradient
        colors={[colors.bubbleFrom, colors.bubbleTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.bubble, { borderColor: colors.border }]}
      >
        <Text style={[styles.userText, { color: colors.fg }]}>{text}</Text>
      </LinearGradient>
      <View style={styles.userActions}>
        <CopyButton size={26} text={text} />
        {/* Edit: drop the message back into the composer to revise and resend. */}
        <IconBtn label="Edit" onPress={() => setDraft(text)} size={26}>
          <Pencil color={colors.mutedFg} size={13} strokeWidth={1.9} />
        </IconBtn>
      </View>
    </View>
  );
}

function AssistantTurn({
  m,
  streaming,
  showFollowups,
}: {
  m: ChatMessage;
  streaming: boolean;
  showFollowups: boolean;
}) {
  // Demo turns carry their render kind on metadata and are BADGED as such — a
  // canned card must never be mistakable for model output. Real turns render from
  // `parts` exactly like web-v3 — a Chain-of-Thought timeline (reasoning +
  // web_search) above the markdown answer.
  const demo = m.metadata?.demo;
  const answer = messageText(m);
  const hasWork = m.parts.some(
    (p) => p.type === "reasoning" || (p.type as string) === "tool-web_search"
  );
  return (
    <View style={styles.assistantRow}>
      <Avatar />
      <View style={styles.assistantCol}>
        {demo ? <DemoBadge /> : null}
        {demo === "image" ? <ImageCard /> : null}
        {demo === "video" ? <VideoCard /> : null}
        {demo === "artifact" ? (
          <ArtifactCard title={m.metadata?.artTitle} kind={m.metadata?.artKind} />
        ) : null}

        {!demo && hasWork ? (
          <CotTimeline
            parts={m.parts}
            streaming={streaming}
            createdAt={m.metadata?.createdAt}
          />
        ) : null}

        {answer ? <Markdown text={answer} /> : null}

        <View style={styles.assistantActions}>
          <CopyButton size={27} text={answer} />
          <VoteButtons />
        </View>

        {showFollowups ? <Followups /> : null}
      </View>
    </View>
  );
}

// Demo turns are canned prototype output, not model output. This badge is the ONLY
// thing that distinguishes them on screen, so it renders above every demo card and
// is never conditional on anything but `metadata.demo`.
function DemoBadge() {
  const { colors } = useTheme();
  return (
    <View style={[styles.demoBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <Text style={[styles.demoBadgeText, { color: colors.mutedFg }]}>
        Demo · not generated
      </Text>
    </View>
  );
}

function ImageCard() {
  const { colors } = useTheme();
  const { openImageFull } = useAppState();
  return (
    <Pressable onPress={openImageFull} style={[styles.imageCard, { borderColor: colors.border }]}>
      <LinearGradient
        colors={["#0ac7b4", "#6366f1", "#1e293b"]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(255,255,255,0.28)", "transparent"]}
        start={{ x: 0.3, y: 0.28 }}
        end={{ x: 0.8, y: 0.8 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.imgBadge}>
        <Text style={styles.imgBadgeText}>AI · IMAGE</Text>
      </View>
      <View style={styles.imgDownload}>
        <Download size={15} color="#fff" strokeWidth={2} />
      </View>
    </Pressable>
  );
}

function VideoCard() {
  return (
    <View style={styles.videoCard}>
      <LinearGradient
        colors={["#1e293b", "#0f766e"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.videoPlayWrap}>
        <View style={styles.videoPlay}>
          <Play size={18} color="#111" fill="#111" />
        </View>
      </View>
      <View style={styles.videoBar}>
        <Play size={9} color="#fff" fill="#fff" />
        <View style={styles.videoTrack}>
          <View style={styles.videoFill} />
        </View>
        <Text style={styles.videoTime}>0:03</Text>
      </View>
      <View style={styles.videoDownload}>
        <Download size={14} color="#fff" strokeWidth={2} />
      </View>
    </View>
  );
}

function ArtifactCard({ title, kind }: { title?: string; kind?: string }) {
  const { colors } = useTheme();
  const { openArtifact } = useAppState();
  return (
    <Pressable
      onPress={openArtifact}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <View style={[styles.artHead, { borderBottomColor: colors.border }]}>
        <View style={[styles.artIcon, { backgroundColor: colors.tealBg }]}>
          <FileText size={15} color={colors.tealLabel} strokeWidth={1.7} />
        </View>
        <View style={styles.artText}>
          <Text style={[styles.artTitle, { color: colors.fg }]}>{title}</Text>
          <Text style={[styles.artKind, { color: colors.mutedFg }]}>{kind} · tap to open</Text>
        </View>
        <Maximize2 size={16} color={colors.mutedFg} strokeWidth={1.9} />
      </View>
      <View style={styles.artBody}>
        <View style={[styles.skel, { width: "82%", backgroundColor: colors.muted }]} />
        <View style={[styles.skel, { width: "96%", backgroundColor: colors.muted }]} />
        <View style={[styles.skel, { width: "68%", backgroundColor: colors.muted }]} />
      </View>
    </Pressable>
  );
}

function Followups() {
  const { colors } = useTheme();
  const { askSuggestion } = useAppState();
  return (
    <View style={[styles.followups, { borderTopColor: colors.border }]}>
      {FOLLOWUPS.map((fu) => (
        <Pressable
          key={fu.label}
          onPress={() => askSuggestion(fu.text)}
          style={[styles.followRow, { borderBottomColor: colors.border }]}
        >
          <Text style={[styles.followLabel, { color: colors.fg }]}>{fu.label}</Text>
          <Plus size={15} color={colors.mutedFg} strokeWidth={2} />
        </Pressable>
      ))}
    </View>
  );
}

// Mirrors the prototype's `dotpulse` keyframe (opacity .25↔1 + translateY 0↔-3px):
// rise over `peakMs`, fall over `peakMs`, then hold at rest for `holdMs`. Native
// driver so it stays smooth off the JS thread. `delayMs` staggers each dot's phase.
function usePulse(peakMs: number, holdMs: number, delayMs = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: peakMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: peakMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(holdMs),
      ]),
    );
    const t = setTimeout(() => loop.start(), delayMs);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [v, peakMs, holdMs, delayMs]);
  return v;
}

// One thinking dot — prototype `dotpulse 1.2s infinite` (0.48s up / 0.48s down / 0.24s rest).
function PulseDot({ delay, color }: { delay: number; color: string }) {
  const v = usePulse(480, 240, delay);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: color, opacity, transform: [{ translateY }] }]}
    />
  );
}

function ThinkingRow() {
  const { colors } = useTheme();
  return (
    <View style={styles.loadRow}>
      <Avatar />
      <View style={styles.thinking}>
        <View style={styles.dots}>
          <PulseDot delay={0} color={colors.mutedFg} />
          <PulseDot delay={200} color={colors.mutedFg} />
          <PulseDot delay={400} color={colors.mutedFg} />
        </View>
        <Text style={[styles.thinkingText, { color: colors.mutedFg }]}>Working…</Text>
      </View>
    </View>
  );
}

function MediaLoading({ kind }: { kind: "image" | "video" }) {
  const { colors } = useTheme();
  const label = kind === "image" ? "Creating image…" : "Generating video… (~1 min)";
  // Whole placeholder card breathes — prototype `dotpulse 1.6s ease-in-out infinite`.
  const v = usePulse(640, 320);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  return (
    <View style={styles.loadRow}>
      <Avatar />
      <Animated.View
        style={[
          kind === "image" ? styles.imgPlaceholder : styles.videoPlaceholder,
          {
            borderColor: colors.border,
            backgroundColor: colors.muted,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        {kind === "image" ? (
          <ImageIcon size={26} color={colors.mutedFg} strokeWidth={1.7} />
        ) : (
          <Play size={26} color={colors.mutedFg} strokeWidth={1.7} />
        )}
        <Text style={[styles.placeholderText, { color: colors.mutedFg }]}>{label}</Text>
      </Animated.View>
    </View>
  );
}

// Message-action button: presses give a spring scale-down for tactile feedback.
// Renders as a plain (non-interactive) view when no `onPress` is passed.
function IconBtn({
  size,
  onPress,
  label,
  children,
}: {
  size: number;
  onPress?: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (toValue: number) =>
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={!onPress}
      hitSlop={6}
      onPress={onPress}
      onPressIn={() => spring(0.86)}
      onPressOut={() => spring(1)}
    >
      <Animated.View
        style={[styles.actionBtn, { width: size, height: size, transform: [{ scale }] }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

// Copy-to-clipboard action: writes the message text, then swaps the icon to a
// teal check that springs in and reverts after a beat.
function CopyButton({ text, size }: { text: string; size: number }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iconSize = size >= 27 ? 14 : 13;

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  const onCopy = async () => {
    const value = text.trim();
    if (!value) {
      return;
    }
    await Clipboard.setStringAsync(value);
    setCopied(true);
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 14 }).start();
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <IconBtn label={copied ? "Copied" : "Copy"} onPress={onCopy} size={size}>
      {copied ? (
        <Animated.View
          style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }}
        >
          <Check color={colors.tealLabel} size={iconSize} strokeWidth={2.4} />
        </Animated.View>
      ) : (
        <Copy color={colors.mutedFg} size={iconSize} strokeWidth={1.9} />
      )}
    </IconBtn>
  );
}

// Thumbs up/down feedback. Client-only selection (mutually exclusive) — mobile
// has no vote backend yet, so this is local visual state, no fake network call.
function VoteButtons() {
  const { colors } = useTheme();
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const tint = (active: boolean) => (active ? colors.tealLabel : colors.mutedFg);

  return (
    <>
      <IconBtn
        label="Good response"
        onPress={() => setVote((v) => (v === "up" ? null : "up"))}
        size={27}
      >
        <ThumbsUp color={tint(vote === "up")} size={14} strokeWidth={1.8} />
      </IconBtn>
      <IconBtn
        label="Bad response"
        onPress={() => setVote((v) => (v === "down" ? null : "down"))}
        size={27}
      >
        <ThumbsDown color={tint(vote === "down")} size={14} strokeWidth={1.8} />
      </IconBtn>
    </>
  );
}

const styles = StyleSheet.create({
  col: { flexDirection: "column", gap: 16, paddingVertical: 10 },

  userWrap: { alignSelf: "flex-end", maxWidth: "80%", alignItems: "flex-end", gap: 3 },
  bubble: {
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  userText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  userActions: { flexDirection: "row" },

  assistantRow: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  assistantCol: { flex: 1, minWidth: 0, gap: 9 },
  assistantText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21.7 },
  assistantActions: { flexDirection: "row", alignItems: "center", marginTop: -1 },

  avatar: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtn: { borderRadius: 7, alignItems: "center", justifyContent: "center" },

  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: "hidden" },
  demoBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  demoBadgeText: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.3 },



  imageCard: {
    width: "100%",
    maxWidth: 290,
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  imgBadge: {
    position: "absolute",
    left: 9,
    bottom: 9,
    backgroundColor: "rgba(0,0,0,0.32)",
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 999,
  },
  imgBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 8.5,
    letterSpacing: 0.51,
    color: "rgba(255,255,255,0.92)",
  },
  imgDownload: {
    position: "absolute",
    right: 9,
    bottom: 9,
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },

  videoCard: {
    width: "100%",
    maxWidth: 330,
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  videoPlayWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlay: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  videoTrack: { flex: 1, height: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.3)" },
  videoFill: { width: "32%", height: "100%", borderRadius: 999, backgroundColor: "#fff" },
  videoTime: { fontFamily: fonts.monoMedium, fontSize: 8, color: "#fff" },
  videoDownload: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },

  artHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  artIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  artText: { flex: 1, minWidth: 0 },
  artTitle: { fontFamily: fonts.semibold, fontSize: 13 },
  artKind: { fontFamily: fonts.regular, fontSize: 11 },
  artBody: { paddingVertical: 12, paddingHorizontal: 13, gap: 6 },
  skel: { height: 6, borderRadius: 999 },

  followups: { marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  followRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  followLabel: { flex: 1, minWidth: 0, fontFamily: fonts.regular, fontSize: 13 },

  loadRow: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8, height: 28 },
  dots: { flexDirection: "row", gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 999 },
  thinkingText: { fontFamily: fonts.regular, fontSize: 13 },

  imgPlaceholder: {
    width: "100%",
    maxWidth: 290,
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  videoPlaceholder: {
    width: "100%",
    maxWidth: 330,
    aspectRatio: 16 / 9,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  placeholderText: { fontFamily: fonts.medium, fontSize: 12 },
});
