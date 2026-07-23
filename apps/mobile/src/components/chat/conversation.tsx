import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Pressable } from "react-native";
import { FOLLOWUPS } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import {
  type ChatMessage,
  messageFiles,
  messageImages,
  messageText,
} from "@/lib/types";
import { ShimmerText } from "@/components/ui/shimmer-text";
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
  const { messages, thinking, busy } = useAppState();
  const lastIdx = messages.length - 1;

  return (
    <View style={styles.col}>
      {messages.map((m, i) =>
        m.role === "user" ? (
          <UserBubble key={m.id} m={m} />
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
      {thinking ? <ThinkingRow /> : null}
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

function UserBubble({ m }: { m: ChatMessage }) {
  const { colors } = useTheme();
  const { setDraft } = useAppState();
  const text = messageText(m);
  // Images the user attached this turn — rendered as thumbnails above the text
  // (real photos, not demo tiles: the same `data:` URL that was sent to the model).
  const images = messageImages(m);
  // Non-image attachments (PDFs) — a labeled chip, not inline bytes. Both only show
  // for the just-sent turn; a reloaded thread carries "[file: name]" text markers.
  const files = messageFiles(m);
  return (
    <View style={styles.userWrap}>
      {images.length > 0 ? (
        <View style={styles.userImages}>
          {images.map((img, i) => (
            <Image
              key={`${m.id}-img-${i}`}
              source={{ uri: img.url }}
              style={[styles.userImage, { borderColor: colors.border }]}
              contentFit="cover"
              accessibilityLabel={img.name ?? "Attached image"}
            />
          ))}
        </View>
      ) : null}
      {files.length > 0 ? (
        <View style={styles.userFiles}>
          {files.map((f, i) => (
            <View
              key={`${m.id}-file-${i}`}
              style={[
                styles.userFile,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <FileText size={15} color={colors.mutedFg} strokeWidth={1.9} />
              <Text
                numberOfLines={1}
                style={[styles.userFileName, { color: colors.fg }]}
              >
                {f.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {text ? (
        <LinearGradient
          colors={[colors.bubbleFrom, colors.bubbleTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bubble, { borderColor: colors.border }]}
        >
          <Text style={[styles.userText, { color: colors.fg }]}>{text}</Text>
        </LinearGradient>
      ) : null}
      {/* Copy/Edit only make sense with text — an image-only turn has neither. */}
      {text ? (
        <View style={styles.userActions}>
          <CopyButton size={26} text={text} />
          {/* Edit: drop the message back into the composer to revise and resend. */}
          <IconBtn label="Edit" onPress={() => setDraft(text)} size={26}>
            <Pencil color={colors.mutedFg} size={13} strokeWidth={1.9} />
          </IconBtn>
        </View>
      ) : null}
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
  // Turns render from `parts` exactly like web-v3 — a Chain-of-Thought timeline
  // (reasoning + web_search) above the markdown answer.
  // The `demo` branches below are DEAD: nothing sets `metadata.demo` since the
  // client-side classifier was removed (see `send` in app-state/store.tsx), so no
  // canned card can reach the thread. Kept only so the prototype's card markup
  // isn't lost before the real image/artifact tools land — those will render from
  // `parts`, so treat this as scaffolding to replace, never to feed.
  const demo = m.metadata?.demo;
  const answer = messageText(m);
  const hasWork = m.parts.some(
    (p) => p.type === "reasoning" || (p.type as string) === "tool-web_search"
  );
  // Nothing to show yet. While the turn is live this is the gap between the first
  // stream event and the first token — it used to render as a bare avatar with an
  // action row under it, indistinguishable from a turn that answered with silence.
  // Once the turn is done it means the model really did return nothing; web-v3
  // shows an honest fallback line there (`isEmptyAssistant`, message.tsx:709).
  const empty = !(demo || hasWork || answer);
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

        {empty && streaming ? <ThinkingLabel /> : null}
        {empty && !streaming ? (
          <Markdown text="I didn't quite catch that — could you rephrase or add a bit more detail?" />
        ) : null}

        {/* Actions appear on a finished turn only — copy/vote on a half-streamed
            answer copies half an answer (web-v3 gates them the same way). */}
        {streaming ? null : (
          <View style={styles.assistantActions}>
            <CopyButton size={27} text={answer} />
            <VoteButtons />
          </View>
        )}

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

// The waiting label. web-v3 renders exactly this while a turn has no content yet
// — `<Shimmer duration={1}>Thinking...</Shimmer>` (components/chat/message.tsx:688)
// — so mobile uses the same shimmering text instead of the prototype's three
// pulsing dots.
function ThinkingLabel() {
  const { colors } = useTheme();
  return (
    <ShimmerText
      text="Thinking…"
      color={colors.mutedFg}
      size={13}
      style={styles.thinking}
    />
  );
}

// Pre-stream row (status "submitted"): no assistant message exists yet, so the
// avatar has to come from here. Once the message arrives, `AssistantTurn` owns
// the same label.
function ThinkingRow() {
  return (
    <View style={styles.loadRow}>
      <Avatar />
      <ThinkingLabel />
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
  userImages: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
    marginBottom: 5,
  },
  userImage: {
    width: 116,
    height: 116,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  userFiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
    marginBottom: 5,
  },
  userFile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    maxWidth: 220,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  userFileName: { fontFamily: fonts.medium, fontSize: 12.5, flexShrink: 1 },
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
  thinking: { height: 28 },

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
