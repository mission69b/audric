import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ARTIFACT_LINES } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  GitCompare,
  MessageSquare,
  Pencil,
  Redo2,
  Undo2,
  X,
} from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// Demo artifact metadata (prototype hardcodes these in renderVals).
const TITLE = "Launch announcement";
const STATUS = "Updated 2m ago";
const VERSION = "v2/2";

// The artifact viewer (prototype ARTIFACTS VIEWER). A full-screen editor surface
// for a generated document: header (icon · title · version · close), an editing
// toolbar, the document body, and a version footer. Chrome is presentational
// (the demo document is read-only); opened by tapping an assistant artifact card.
export function ArtifactViewer() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { artifactOpen, closeArtifact } = useAppState();
  const [copied, setCopied] = useState(false);

  const toolIcon = (Icon: typeof Undo2) => (
    <View style={styles.tool}>
      <Icon size={15} color={colors.mutedFg} strokeWidth={1.9} />
    </View>
  );

  // Copy the artifact's actual visible text (title + body lines). The other
  // toolbar icons are chrome for the read-only demo document; Copy is the one
  // action backed by real content on screen, so it's the only one wired.
  const onCopy = async () => {
    await Clipboard.setStringAsync(`${TITLE}\n\n${ARTIFACT_LINES.join("\n")}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <Modal
      visible={artifactOpen}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={closeArtifact}
    >
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 8, borderBottomColor: colors.border },
          ]}
        >
          <View style={[styles.fileTile, { backgroundColor: colors.tealBg }]}>
            <FileText size={16} color={colors.tealLabel} strokeWidth={1.7} />
          </View>
          <View style={styles.headMid}>
            <Text numberOfLines={1} style={[styles.headTitle, { color: colors.fg }]}>
              {TITLE}
            </Text>
            <Text style={[styles.headStatus, { color: colors.mutedFg }]}>{STATUS}</Text>
          </View>
          <Text
            style={[styles.version, { color: colors.mutedFg, backgroundColor: colors.muted }]}
          >
            {VERSION}
          </Text>
          <Pressable
            onPress={closeArtifact}
            style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
          >
            <X size={15} color={colors.mutedFg} strokeWidth={2.2} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.toolbar, { borderBottomColor: colors.border }]}
          contentContainerStyle={styles.toolbarBody}
        >
          {toolIcon(Undo2)}
          {toolIcon(Redo2)}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable onPress={onCopy} style={styles.tool}>
            {copied ? (
              <Check size={15} color={colors.tealLabel} strokeWidth={2.2} />
            ) : (
              <Copy size={15} color={colors.mutedFg} strokeWidth={1.9} />
            )}
          </Pressable>
          {toolIcon(Pencil)}
          {toolIcon(MessageSquare)}
        </ScrollView>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={[styles.docTitle, { color: colors.fg }]}>{TITLE}</Text>
          {ARTIFACT_LINES.map((ln, i) => (
            <Text key={i} style={[styles.docLine, { color: colors.secondaryFg }]}>
              {ln}
            </Text>
          ))}
        </ScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + 24, borderTopColor: colors.border },
          ]}
        >
          <View style={[styles.latest, { borderColor: colors.border }]}>
            <Undo2 size={13} color={colors.mutedFg} strokeWidth={2} />
            <Text style={[styles.latestLabel, { color: colors.mutedFg }]}>Latest</Text>
          </View>
          <View style={styles.nav}>
            <View style={[styles.navBtn, { borderColor: colors.border }]}>
              <ChevronLeft size={15} color={colors.fg} strokeWidth={2} />
            </View>
            <Text style={[styles.navLabel, { color: colors.mutedFg }]}>2 / 2</Text>
            <View style={[styles.navBtn, { borderColor: colors.border }]}>
              <ChevronRight size={15} color={colors.mutedFg} strokeWidth={2} />
            </View>
            <View style={[styles.navBtn, { borderColor: colors.border }]}>
              <GitCompare size={15} color={colors.mutedFg} strokeWidth={1.9} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fileTile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  headMid: { flex: 1, minWidth: 0 },
  headTitle: { fontFamily: fonts.semibold, fontSize: 14 },
  headStatus: { fontFamily: fonts.regular, fontSize: 11, marginTop: 1 },
  version: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 7,
    overflow: "hidden",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbar: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarBody: { alignItems: "center", gap: 1, paddingVertical: 7, paddingHorizontal: 10 },
  tool: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { width: 1, height: 18, marginHorizontal: 5 },
  body: { flex: 1 },
  bodyContent: { paddingVertical: 17, paddingHorizontal: 18, gap: 11 },
  docTitle: { fontFamily: fonts.semibold, fontSize: 19, letterSpacing: -0.38 },
  docLine: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 21.45 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  latest: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  latestLabel: { fontFamily: fonts.semibold, fontSize: 12 },
  nav: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 5 },
  navBtn: {
    width: 30,
    height: 30,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    minWidth: 30,
    textAlign: "center",
  },
});
