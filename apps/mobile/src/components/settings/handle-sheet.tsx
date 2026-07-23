import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAppState } from "@/app-state/store";
import { BottomSheet } from "@/components/ui/sheet";
import { Check, X } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

const AVAIL = "#10b981";

// Claim-a-handle sheet (prototype HANDLE). A @audric name for the passport.
// Availability is a pure length check (demo) — 3–20 chars flips the green line;
// Claiming is NOT wired (no @handle mint backend), so the claim action is
// disabled and labelled "coming soon" instead of silently closing the sheet.
export function HandleSheet() {
  const { colors } = useTheme();
  const { handleSheet, closeHandle, handleText, onHandleText } = useAppState();
  const valid = handleText.length >= 3 && handleText.length <= 20;

  return (
    <BottomSheet visible={handleSheet} onClose={closeHandle} maxHeightRatio={0.9}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.fg }]}>Claim your handle</Text>
        <Pressable onPress={closeHandle} hitSlop={8} style={[styles.close, { backgroundColor: colors.secondary }]}>
          <X size={14} color={colors.mutedFg} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.fg }]}
          value={handleText}
          onChangeText={onHandleText}
          placeholder="yourhandle"
          placeholderTextColor={colors.mutedFg}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
        <Text style={[styles.suffix, { color: colors.mutedFg }]}>@audric</Text>
      </View>

      <Text style={[styles.note, { color: colors.mutedFg }]}>
        3–20 characters · letters, numbers, hyphens
      </Text>

      {valid ? (
        <View style={styles.availRow}>
          <Check size={14} color={AVAIL} strokeWidth={2.4} />
          <Text style={[styles.availText, { color: AVAIL }]}>{handleText}@audric is available</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable onPress={closeHandle} style={[styles.btn, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
          <Text style={[styles.btnText, { color: colors.fg }]}>Cancel</Text>
        </Pressable>
        {/* No @handle mint backend exists, so this cannot claim anything. Disabled
            and labelled rather than presented as a working action. */}
        <View style={[styles.btn, { backgroundColor: colors.muted }]}>
          <Text style={[styles.btnText, { color: colors.mutedFg }]}>Claim — coming soon</Text>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingBottom: 12,
  },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  close: { width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center" },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 2,
  },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 14, paddingVertical: 11 },
  suffix: { fontFamily: fonts.semibold, fontSize: 13 },

  note: { fontFamily: fonts.regular, fontSize: 11.5, marginTop: 9, paddingHorizontal: 2 },

  availRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9, paddingHorizontal: 2 },
  availText: { fontFamily: fonts.medium, fontSize: 12 },

  actions: { flexDirection: "row", gap: 9, marginTop: 16 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  btnText: { fontFamily: fonts.semibold, fontSize: 13.5 },
});
