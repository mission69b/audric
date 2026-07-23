import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "@/app-state/store";
import { Info, X } from "@/components/ui/icon";
import { fonts } from "@/theme/tokens";

// This viewer opens from the badged demo image card — there is no real generation
// behind it (image-gen isn't wired on mobile yet). So the chip + Details pane must
// NOT assert a real model or prompt the way the prototype did ("Model: Audric ·
// Image" + a fabricated prompt read as a genuine result). They now state plainly
// that this is a demo placeholder, matching the in-thread "Demo · not generated".
const FULL_MODEL = "Demo · not generated";
// Fixed on-black chrome — this viewer is dark in both themes (prototype FULLSCREEN
// IMAGE), so it uses literal white-alpha colors rather than theme tokens.
const W12 = "rgba(255,255,255,0.12)";
const W08 = "rgba(255,255,255,0.08)";
const W55 = "rgba(255,255,255,0.55)";
const W72 = "rgba(255,255,255,0.72)";

// Full-screen image viewer (prototype FULLSCREEN IMAGE). A black overlay with the
// generated image (the demo gradient), a Details toggle exposing model + prompt,
// Opened by tapping an assistant image card.
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
              This is a <Text style={styles.detValue}>demo placeholder</Text> —
              image generation isn't live on mobile yet, so no model was run and
              nothing here was generated.
            </Text>
          </View>
        ) : null}

        {/* "Copy image" / "Download image" buttons lived here. They were plain
            Views with no handler at all, over a demo placeholder image — nothing
            real to copy or save. Removed until image generation is live. */}
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
});
