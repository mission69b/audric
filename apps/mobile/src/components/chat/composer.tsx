import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import {
  CTX,
  SLASH_COMMANDS,
  type SlashKey,
  VISION_MODELS,
} from "@/app-state/catalog";
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
  TriangleAlert,
  X,
} from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts, radius } from "@/theme/tokens";

const SLASH_ICON: Record<SlashKey, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  new: SquarePen,
  clear: Trash2,
  model: List,
  theme: Palette,
  delete: X,
  purge: Eraser,
};

// The chat composer (prototype "COMPOSER"): optional slash-command menu, the
// vision-error banner, the attach preview strip, the text input, and the control
// row (attach · model chip · memory toggle · context ring · send/stop). 1:1 with
// the prototype markup + derived values (slashOpen, ctxShow, attach states…).
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
    attachDemo,
    toggleAttach,
    memoryOn,
    toggleMemory,
    openCtx,
    runSlash,
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
  const attachVisionError = attachDemo && !VISION_MODELS.has(model);

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
        {attachVisionError ? (
          <View style={styles.visionBanner}>
            <TriangleAlert size={15} color={colors.warnFg} strokeWidth={2} />
            <Text style={[styles.visionText, { color: colors.warnFg }]}>
              This model can't see images. Switch to a vision model or Auto. (PDFs work on any model.)
            </Text>
          </View>
        ) : null}

        {attachDemo ? <AttachStrip /> : null}

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
            onPress={toggleAttach}
            style={[
              styles.attachBtn,
              {
                borderColor: colors.border,
                backgroundColor: attachDemo ? colors.secondary : "transparent",
              },
            ]}
          >
            <Paperclip
              size={16}
              color={attachDemo ? colors.fg : colors.mutedFg}
              strokeWidth={1.9}
            />
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

// The upload-overlay ring — prototype `animation:spin .8s linear infinite`.
function Spinner() {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rot, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rot]);
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />;
}

// The three demo attachments (prototype attachItems): two image tiles (the second
// mid-upload) and a PDF card. The tiles are presentational (no real files), but
// each × removes its own tile the way the webapp removes a real attachment —
// tracked in local state. Removing the last tile clears the whole demo strip via
// the store toggle so the composer returns to its empty state.
type AttachTile = "img" | "uploading" | "pdf";

function AttachStrip() {
  const { colors } = useTheme();
  const { toggleAttach } = useAppState();
  const [tiles, setTiles] = useState<AttachTile[]>(["img", "uploading", "pdf"]);

  const remove = (id: AttachTile) => {
    const next = tiles.filter((t) => t !== id);
    if (next.length === 0) {
      toggleAttach();
    } else {
      setTiles(next);
    }
  };

  return (
    <View style={styles.attachStrip}>
      {tiles.includes("img") ? (
        <View style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.muted }]}>
          <LinearGradient
            colors={["#0ac7b4", "#6366f1"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tileImg}
          />
          <TileRemove onPress={() => remove("img")} />
        </View>
      ) : null}
      {tiles.includes("uploading") ? (
        <View style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.muted }]}>
          <LinearGradient
            colors={["#0ac7b4", "#6366f1"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tileImg}
          />
          <View style={styles.tileUploading}>
            <Spinner />
          </View>
          <TileRemove onPress={() => remove("uploading")} />
        </View>
      ) : null}
      {tiles.includes("pdf") ? (
        <View style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.muted }]}>
          <View style={styles.tileFile}>
            <FileText size={20} color={colors.mutedFg} strokeWidth={1.7} />
            <Text style={[styles.tileBadge, { color: colors.mutedFg }]}>PDF</Text>
          </View>
          <TileRemove onPress={() => remove("pdf")} />
        </View>
      ) : null}
    </View>
  );
}

function TileRemove({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.tileRemove}>
      <X size={9} color="#fff" strokeWidth={3} />
    </Pressable>
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
  visionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(217,119,6,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(217,119,6,0.3)",
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 9,
  },
  visionText: { flex: 1, fontFamily: fonts.medium, fontSize: 11.5, lineHeight: 16 },

  input: { fontFamily: fonts.regular, fontSize: 14.5, paddingTop: 2, paddingBottom: 6, padding: 0 },

  controls: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 6 },
  attachBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
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

  attachStrip: { flexDirection: "row", gap: 9, marginBottom: 11, flexWrap: "wrap" },
  tile: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileImg: { flex: 1, backgroundColor: "#0ac7b4" },
  tileUploading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.35)",
    borderTopColor: "#fff",
  },
  tileFile: { flex: 1, alignItems: "center", justifyContent: "center", gap: 5 },
  tileBadge: { fontFamily: fonts.bold, fontSize: 8, letterSpacing: 0.4 },
  tileRemove: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 17,
    height: 17,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
});
