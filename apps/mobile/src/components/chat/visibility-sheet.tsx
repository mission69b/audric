import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppState } from "@/app-state/store";
import { BottomSheet } from "@/components/ui/sheet";
import { Check, Globe, Lock } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// The "Chat visibility" bottom sheet (prototype VISIBILITY SHEET). Two rows —
// Private (default) and Public (read-only share link) — with the active one
// tinted and check-marked. No close button in the prototype; the scrim/handle
// dismiss it. Mirrors web-v3's per-chat visibility control.
export function VisibilitySheet() {
  const { colors } = useTheme();
  const { visSheet, closeVis, visibility, setVisibility } = useAppState();
  const isPrivate = visibility === "private";

  return (
    <BottomSheet visible={visSheet} onClose={closeVis}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.fg }]}>Chat visibility</Text>
        <Text style={[styles.sub, { color: colors.mutedFg }]}>
          Private by default. Make a single chat public to share a read-only link.
        </Text>
      </View>

      <View style={styles.rows}>
        <Pressable
          onPress={() => setVisibility("private")}
          style={[
            styles.row,
            { backgroundColor: isPrivate ? colors.secondary : "transparent" },
          ]}
        >
          <Lock size={18} color={colors.fg} strokeWidth={1.8} />
          <View style={styles.mid}>
            <Text style={[styles.rowTitle, { color: colors.fg }]}>Private</Text>
            <Text style={[styles.rowSub, { color: colors.mutedFg }]}>
              Only you can access this chat
            </Text>
          </View>
          {isPrivate ? (
            <Check size={18} color={colors.tealLabel} strokeWidth={2.4} />
          ) : null}
        </Pressable>

        <Pressable
          onPress={() => setVisibility("public")}
          style={[
            styles.row,
            { backgroundColor: !isPrivate ? colors.secondary : "transparent" },
          ]}
        >
          <Globe size={18} color={colors.fg} strokeWidth={1.8} />
          <View style={styles.mid}>
            <Text style={[styles.rowTitle, { color: colors.fg }]}>Public</Text>
            <Text style={[styles.rowSub, { color: colors.mutedFg }]}>
              Anyone with the link can access this chat
            </Text>
          </View>
          {!isPrivate ? (
            <Check size={18} color={colors.tealLabel} strokeWidth={2.4} />
          ) : null}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 2, paddingBottom: 8, gap: 2 },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  sub: { fontFamily: fonts.regular, fontSize: 11.5 },
  rows: { gap: 2, paddingTop: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
  },
  mid: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.medium, fontSize: 13.5 },
  rowSub: { fontFamily: fonts.regular, fontSize: 11.5, marginTop: 1 },
});
