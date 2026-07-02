import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "@/app-state/store";
import { Copy, Download, Info, X } from "@/components/ui/icon";
import { fonts } from "@/theme/tokens";

const FULL_MODEL = "Audric · Image";
const FULL_PROMPT = "A minimal geometric logo, teal on charcoal";
// Fixed on-black chrome — this viewer is dark in both themes (prototype FULLSCREEN
// IMAGE), so it uses literal white-alpha colors rather than theme tokens.
const W12 = "rgba(255,255,255,0.12)";
const W08 = "rgba(255,255,255,0.08)";
const W55 = "rgba(255,255,255,0.55)";
const W72 = "rgba(255,255,255,0.72)";

// Full-screen image viewer (prototype FULLSCREEN IMAGE). A black overlay with the
// generated image (the demo gradient), a Details toggle exposing model + prompt,
// and Copy / Download actions. Opened by tapping an assistant image card.
export function ImageFullscreen() {
  const insets = useSafeAreaInsets();
  const { imageFull, closeImageFull, imageDetails, toggleImageDetails } = useAppState();

  return (
    <Modal
      visible={imageFull}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeImageFull}
    >
      <View style={styles.root}>
        {/* This viewer is on-black in both themes, so force light status-bar
            glyphs — otherwise light mode paints dark, invisible icons. */}
        <StatusBar style="light" />
        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.chip}>{FULL_MODEL}</Text>
          <Pressable onPress={toggleImageDetails} style={styles.detailsBtn}>
            <Info size={14} color="#fff" strokeWidth={2} />
            <Text style={styles.detailsLabel}>Details</Text>
          </Pressable>
          <Pressable onPress={closeImageFull} style={styles.closeBtn}>
            <X size={16} color="#fff" strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={styles.center}>
          <View style={styles.imageWrap}>
            <LinearGradient
              colors={["#0ac7b4", "#6366f1", "#1e293b"]}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={["rgba(255,255,255,0.28)", "transparent"]}
              start={{ x: 0.15, y: 0.12 }}
              end={{ x: 0.62, y: 0.6 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>

        {imageDetails ? (
          <View style={styles.details}>
            <Text style={styles.detLabel}>
              Model: <Text style={styles.detValue}>{FULL_MODEL}</Text>
            </Text>
            <Text style={styles.detLabel}>
              Prompt: <Text style={styles.detValue}>{FULL_PROMPT}</Text>
            </Text>
          </View>
        ) : null}

        <View style={[styles.actions, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.copyBtn}>
            <Copy size={15} color="#fff" strokeWidth={1.9} />
            <Text style={styles.copyLabel}>Copy image</Text>
          </View>
          <View style={styles.downloadBtn}>
            <Download size={15} color="#111" strokeWidth={1.9} />
            <Text style={styles.downloadLabel}>Download image</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  chip: {
    fontFamily: fonts.semibold,
    fontSize: 9.5,
    letterSpacing: 0.48,
    color: W72,
    backgroundColor: W12,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  detailsBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: W12,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  detailsLabel: { fontFamily: fonts.medium, fontSize: 12, color: "#fff" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: W12,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  imageWrap: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  details: {
    marginTop: 14,
    marginHorizontal: 16,
    backgroundColor: W08,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 7,
  },
  detLabel: { fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 17, color: W55 },
  detValue: { color: "#fff" },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  copyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: W12,
    borderRadius: 12,
    paddingVertical: 12,
  },
  copyLabel: { fontFamily: fonts.semibold, fontSize: 13, color: "#fff" },
  downloadBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
  },
  downloadLabel: { fontFamily: fonts.semibold, fontSize: 13, color: "#111" },
});
