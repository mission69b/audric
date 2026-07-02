import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppState } from "@/app-state/store";
import { CenterDialog } from "@/components/ui/sheet";
import { GoogleG, Sparkles } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// Guest sign-in nudge (prototype NUDGE). Fires after the 3rd anonymous turn (see
// store.send). "Continue with Google" flips out of guest mode; "Maybe later"
// dismisses. Presentational sign-in (no auth backend yet).
export function NudgeDialog() {
  const { colors } = useTheme();
  const { nudge, closeNudge, signInFromNudge } = useAppState();

  return (
    <CenterDialog visible={nudge} onClose={closeNudge}>
      <View style={[styles.tile, { backgroundColor: colors.tealBg }]}>
        <Sparkles size={22} color={colors.tealLabel} strokeWidth={1.9} />
      </View>
      <Text style={[styles.title, { color: colors.fg }]}>Keep going — it&apos;s free</Text>
      <Text style={[styles.body, { color: colors.mutedFg }]}>
        You&apos;re chatting as a guest. Create your free Passport with Google — no
        seed phrase, no card — to save your chats, keep your private memory, and get
        higher limits.
      </Text>

      <Pressable onPress={signInFromNudge} style={[styles.primary, { backgroundColor: colors.fg }]}>
        <GoogleG size={18} />
        <Text style={[styles.primaryText, { color: colors.bg }]}>Continue with Google</Text>
      </Pressable>
      <Pressable onPress={closeNudge} style={styles.later} hitSlop={6}>
        <Text style={[styles.laterText, { color: colors.mutedFg }]}>Maybe later</Text>
      </Pressable>
    </CenterDialog>
  );
}

const styles = StyleSheet.create({
  tile: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.34 },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 18 },

  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 13,
    paddingVertical: 13,
  },
  primaryText: { fontFamily: fonts.semibold, fontSize: 14 },
  later: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  laterText: { fontFamily: fonts.medium, fontSize: 13 },
});
