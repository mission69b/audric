import { Pressable, StyleSheet, Text, View } from "react-native";
import { SUGGESTIONS } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import { AudricMark, ChevronRight } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts, radius } from "@/theme/tokens";

// Chat empty state (prototype "EMPTY STATE"): the mark, the value line, and three
// tappable suggestion chips that each send their literal prompt via askSuggestion.
export function EmptyState() {
  const { colors } = useTheme();
  const { askSuggestion } = useAppState();

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <AudricMark size={40} color={colors.fg} />
        <Text style={[styles.title, { color: colors.fg }]}>Private AI, truly yours</Text>
        <Text style={[styles.sub, { color: colors.mutedFg }]}>
          Ask anything. Send USDC. Nothing leaves your control.
        </Text>
      </View>

      <View style={styles.list}>
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s.label}
            onPress={() => askSuggestion(s.text)}
            style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.dot, { backgroundColor: colors.tealLabel }]} />
            <Text style={[styles.chipLabel, { color: colors.secondaryFg }]}>{s.label}</Text>
            <ChevronRight size={14} color={colors.mutedFg} strokeWidth={2} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 6,
  },
  head: { alignItems: "center", gap: 13 },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 23,
    letterSpacing: -0.69,
    textAlign: "center",
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21.7,
    textAlign: "center",
    maxWidth: 248,
  },
  list: { width: "100%", maxWidth: 300, gap: 8, marginTop: 26 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  dot: { width: 5, height: 5, borderRadius: 999 },
  chipLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 13 },
});
