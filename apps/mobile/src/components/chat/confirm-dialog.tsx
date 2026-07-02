import { Pressable, StyleSheet, Text, View } from "react-native";
import { CONFIRM_COPY } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import { CenterDialog } from "@/components/ui/sheet";
import { TriangleAlert } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// Fixed destructive red (prototype uses #dc2626 in both themes for these).
const RED = "#dc2626";
const RED_BG = "rgba(220,38,38,0.12)";

// The destructive-confirm dialog (prototype DESTRUCTIVE CONFIRM DIALOG). One
// centered card reused for delete-chats / purge-data / forget-memories /
// sign-out — copy is keyed off `confirmKind` (CONFIRM_COPY, verbatim from
// web-v3). Cancel dismisses; the red CTA runs `doConfirm`.
export function ConfirmDialog() {
  const { colors } = useTheme();
  const { confirmKind, closeConfirm, doConfirm } = useAppState();
  const copy = confirmKind ? CONFIRM_COPY[confirmKind] : null;

  return (
    <CenterDialog visible={confirmKind !== null} onClose={closeConfirm}>
      <View style={[styles.iconBox, { backgroundColor: RED_BG }]}>
        <TriangleAlert size={21} color={RED} strokeWidth={1.9} />
      </View>
      <Text style={[styles.title, { color: colors.fg }]}>{copy?.title}</Text>
      <Text style={[styles.body, { color: colors.mutedFg }]}>{copy?.body}</Text>
      <View style={styles.actions}>
        <Pressable
          onPress={closeConfirm}
          style={[styles.cancel, { borderColor: colors.border }]}
        >
          <Text style={[styles.cancelLabel, { color: colors.fg }]}>Cancel</Text>
        </Pressable>
        <Pressable onPress={doConfirm} style={styles.confirm}>
          <Text style={styles.confirmLabel}>{copy?.cta}</Text>
        </Pressable>
      </View>
    </CenterDialog>
  );
}

const styles = StyleSheet.create({
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  title: { fontFamily: fonts.semibold, fontSize: 16.5, letterSpacing: -0.16 },
  body: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 20, marginTop: 8, marginBottom: 18 },
  actions: { flexDirection: "row", gap: 9 },
  cancel: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  cancelLabel: { fontFamily: fonts.semibold, fontSize: 13 },
  confirm: {
    flex: 1,
    backgroundColor: RED,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  confirmLabel: { fontFamily: fonts.semibold, fontSize: 13, color: "#fff" },
});
