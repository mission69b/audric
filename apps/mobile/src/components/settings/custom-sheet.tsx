import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAppState } from "@/app-state/store";
import { BottomSheet } from "@/components/ui/sheet";
import { X } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// Custom instructions sheet (prototype CUSTOM). Standing directions Audric
// follows in every reply. Draft is held in the store (customText) so it survives
// re-opening the sheet within a session; Save just closes (no backend yet).
export function CustomSheet() {
  const { colors } = useTheme();
  const { customSheet, closeCustom, customText, onCustomText } = useAppState();

  return (
    <BottomSheet visible={customSheet} onClose={closeCustom} maxHeightRatio={0.9}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.fg }]}>Custom instructions</Text>
        <Pressable onPress={closeCustom} hitSlop={8} style={[styles.close, { backgroundColor: colors.secondary }]}>
          <X size={14} color={colors.mutedFg} strokeWidth={2.2} />
        </Pressable>
      </View>

      <Text style={[styles.desc, { color: colors.mutedFg }]}>
        Standing directions Audric follows in every reply — the language to answer
        in, tone, what to call you, format. Unlike memory, these always apply.
      </Text>

      <TextInput
        style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.fg }]}
        value={customText}
        onChangeText={onCustomText}
        multiline
        textAlignVertical="top"
        placeholder={"e.g. Always respond in German.\nBe concise. Call me Phil."}
        placeholderTextColor={colors.mutedFg}
        maxLength={2000}
      />
      <Text style={[styles.counter, { color: colors.mutedFg }]}>{customText.length}/2000</Text>

      <Pressable onPress={closeCustom} style={[styles.save, { backgroundColor: colors.tealLabel }]}>
        <Text style={styles.saveText}>Save</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  close: { width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center" },

  desc: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 19.4, paddingVertical: 12, paddingHorizontal: 2 },

  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    height: 118,
    paddingHorizontal: 13,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  counter: { fontFamily: fonts.mono, fontSize: 11, textAlign: "right", marginTop: 6, paddingHorizontal: 2 },

  save: { borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  saveText: { fontFamily: fonts.semibold, fontSize: 13.5, color: "#fff" },
});
