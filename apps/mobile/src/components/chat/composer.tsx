import { Image } from "expo-image";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { CTX, SLASH_COMMANDS, type SlashKey } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import {
  ArrowUp,
  ChevronDown,
  Eraser,
  FileText,
  List,
  Palette,
  Paperclip,
  SquarePen,
  Trash2,
  X,
} from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

const SLASH_ICON: Record<SlashKey, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  new: SquarePen,
  clear: Trash2,
  model: List,
  theme: Palette,
  delete: X,
  purge: Eraser,
};

// The chat composer (prototype "COMPOSER"): optional slash-command menu, a preview
// strip for staged images, the text input, and the control row (attach · model chip ·
// memory toggle · context ring · send/stop). The paperclip is a REAL path now: OS
// photo picker → base64 `data:` URL `file` part → the model reads it directly (see
// `lib/attachments.ts`). Every mobile model — Kimi/Auto included — accepts image input
// (verified via the Gateway), so `canAttach` is effectively always true; the gate is
// kept only as forward-safety for a future text-only model.
export function Composer() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    draft,
    setDraft,
    send,
    stop,
    busy,
    model,
    openModel,
    memoryOn,
    toggleMemory,
    openCtx,
    runSlash,
    attachments,
    canAttach,
    pickAttachment,
    removeAttachment,
  } = useAppState();

  const slashCmds = useMemo(() => {
    const sq = draft.replace(/^\//, "").toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.name.startsWith(sq));
  }, [draft]);
  const slashOpen = draft.startsWith("/") && slashCmds.length > 0;

  // Context meter hidden until REAL token usage is wired (catalog CTX is static
  // prototype data — showing it would fake live numbers). To re-enable: surface
  // usage from the stream's finish part (chat+api → message metadata), replace
  // catalog CTX with it, then restore `messages.length > 0 && !busy`.
  const ctxShow = false;

  return (
    <View style={[styles.wrap, { paddingBottom: (insets.bottom || 12) + 8 }]}>
      {slashOpen ? (
        <View style={[styles.slash, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.slashHead, { color: colors.mutedFg }]}>Commands</Text>
          <View style={styles.slashList}>
            {slashCmds.map((c) => {
              const Ic = SLASH_ICON[c.name];
              return (
                <Pressable key={c.name} onPress={() => runSlash(c.name)} style={styles.slashRow}>
                  <View style={[styles.slashIcon, { backgroundColor: colors.muted }]}>
                    <Ic size={15} color={colors.mutedFg} strokeWidth={1.8} />
                  </View>
                  <Text style={[styles.slashName, { color: colors.fg }]}>/{c.name}</Text>
                  <Text style={[styles.slashDesc, { color: colors.mutedFg }]}>{c.desc}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {attachments.length > 0 ? (
          <View style={styles.attachStrip}>
            {attachments.map((a) => {
              const isImage = a.mediaType.startsWith("image/");
              return (
                <View
                  key={a.id}
                  style={[
                    styles.thumb,
                    { borderColor: colors.border },
                    !isImage && { backgroundColor: colors.muted },
                  ]}
                >
                  {isImage ? (
                    <Image source={{ uri: a.url }} style={styles.thumbImg} contentFit="cover" />
                  ) : (
                    <View style={styles.thumbFile}>
                      <FileText size={18} color={colors.mutedFg} strokeWidth={1.8} />
                      <Text
                        numberOfLines={1}
                        style={[styles.thumbFileName, { color: colors.mutedFg }]}
                      >
                        {a.name}
                      </Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => removeAttachment(a.id)}
                    hitSlop={6}
                    style={[styles.thumbX, { backgroundColor: colors.fg }]}
                  >
                    <X size={11} color={colors.bg} strokeWidth={2.8} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}

        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => send()}
          returnKeyType="send"
          blurOnSubmit={false}
          placeholder="Message Audric…"
          placeholderTextColor={colors.mutedFg}
          style={[styles.input, { color: colors.fg }]}
        />

        <View style={styles.controls}>
          <Pressable
            onPress={pickAttachment}
            hitSlop={6}
            style={[styles.attachBtn, { borderColor: colors.border }, !canAttach && styles.attachDim]}
          >
            <Paperclip size={16} color={colors.mutedFg} strokeWidth={1.9} />
          </Pressable>

          <Pressable
            onPress={openModel}
            style={[styles.modelChip, { borderColor: colors.border, backgroundColor: colors.secondary }]}
          >
            <Text
              numberOfLines={1}
              style={[styles.modelText, { color: colors.secondaryFg }]}
            >
              {model}
            </Text>
            <ChevronDown size={12} color={colors.secondaryFg} strokeWidth={2.2} />
          </Pressable>

          <Pressable
            onPress={toggleMemory}
            style={[styles.memBtn, { borderColor: colors.border }]}
          >
            <View
              style={[
                styles.memTrack,
                {
                  backgroundColor: memoryOn ? colors.teal : colors.border,
                  justifyContent: memoryOn ? "flex-end" : "flex-start",
                },
              ]}
            >
              <View style={styles.memKnob} />
            </View>
            <Text style={[styles.memText, { color: colors.mutedFg }]}>Memory</Text>
          </Pressable>

          {ctxShow ? (
            <Pressable
              onPress={openCtx}
              style={[styles.ctxBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.ctxText, { color: colors.mutedFg }]}>{CTX.pct}</Text>
              <CtxRing color={colors.mutedFg} />
            </Pressable>
          ) : null}

          {busy ? (
            <Pressable onPress={stop} style={[styles.sendBtn, { backgroundColor: colors.fg }]}>
              <View style={[styles.stopSquare, { backgroundColor: colors.bg }]} />
            </Pressable>
          ) : (
            <Pressable onPress={() => send()} style={[styles.sendBtn, { backgroundColor: colors.fg }]}>
              <ArrowUp size={17} color={colors.bg} strokeWidth={2.4} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// Context-usage ring (prototype ctx meter): a faint full circle + a progress arc
// at 6.2%, rotated so it starts at 12 o'clock.
function CtxRing({ color }: { color: string }) {
  const r = 9;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - CTX.frac);
  return (
    <Svg width={15} height={15} viewBox="0 0 20 20">
      <Circle cx={10} cy={10} r={r} stroke={color} strokeWidth={2} opacity={0.25} fill="none" />
      <Circle
        cx={10}
        cy={10}
        r={r}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.7}
        fill="none"
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={offset}
        transform="rotate(-90 10 10)"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingTop: 8 },

  slash: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 8,
  },
  slashHead: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    paddingTop: 11,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  slashList: { maxHeight: 236, paddingHorizontal: 6, paddingBottom: 6, paddingTop: 2 },
  slashRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 8,
    borderRadius: 11,
  },
  slashIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  slashName: { fontFamily: fonts.monoMedium, fontSize: 13 },
  slashDesc: { fontFamily: fonts.regular, fontSize: 12 },

  box: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingTop: 13,
    paddingHorizontal: 15,
    paddingBottom: 11,
  },

  input: { fontFamily: fonts.regular, fontSize: 14.5, paddingTop: 2, paddingBottom: 6, padding: 0 },

  attachStrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "visible",
  },
  thumbImg: { width: "100%", height: "100%", borderRadius: 12 },
  thumbFile: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    gap: 3,
  },
  thumbFileName: { fontFamily: fonts.medium, fontSize: 8.5, textAlign: "center" },
  thumbX: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  controls: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 6 },
  attachBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  attachDim: { opacity: 0.4 },
  modelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
    flexShrink: 1,
    minWidth: 0,
  },
  modelText: { fontFamily: fonts.medium, fontSize: 12, flexShrink: 1 },
  memBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  memTrack: {
    width: 20,
    height: 13,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    padding: 1.5,
  },
  memKnob: { width: 10, height: 10, borderRadius: 999, backgroundColor: "#fff" },
  memText: { fontFamily: fonts.medium, fontSize: 12 },
  ctxBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  ctxText: { fontFamily: fonts.monoMedium, fontSize: 11.5 },
  sendBtn: {
    marginLeft: "auto",
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  stopSquare: { width: 11, height: 11, borderRadius: 3 },
});
