import { StyleSheet, Text, View } from "react-native";
import { CTX } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import { BottomSheet, SheetHeader } from "@/components/ui/sheet";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

const GREEN = "#10b981";

// The "Context" bottom sheet (prototype CONTEXT SHEET). A read-only meter of the
// current turn's token budget: percentage + used/total, a fill bar, a per-bucket
// breakdown (input/output/reasoning), and a "This turn" cost — all Free because
// Auto routes to Kimi. Opened from the composer's context ring.
export function ContextSheet() {
  const { colors } = useTheme();
  const { ctxOpen, closeCtx } = useAppState();

  return (
    <BottomSheet visible={ctxOpen} onClose={closeCtx}>
      <SheetHeader title="Context" onClose={closeCtx} />

      <View style={styles.pctRow}>
        <Text style={[styles.pct, { color: colors.fg }]}>{CTX.pct}</Text>
        <Text style={[styles.total, { color: colors.mutedFg }]}>
          {CTX.used} / {CTX.total}
        </Text>
      </View>

      <View style={styles.barWrap}>
        <View style={[styles.track, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.fill,
              { width: CTX.pct as `${number}%`, backgroundColor: colors.teal },
            ]}
          />
        </View>
      </View>

      <View style={styles.rows}>
        {CTX.rows.map((r) => (
          <View key={r.label} style={[styles.row, { borderBottomColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.fg }]}>{r.label}</Text>
            <View style={styles.rowRight}>
              <Text style={[styles.tok, { color: colors.mutedFg }]}>{r.tok}</Text>
              <Text style={styles.cost}>{r.cost}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.turn, { backgroundColor: colors.secondary }]}>
        <Text style={[styles.turnLabel, { color: colors.secondaryFg }]}>This turn</Text>
        <Text style={styles.turnCost}>{CTX.turnCost}</Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  pctRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  pct: { fontFamily: fonts.semibold, fontSize: 20 },
  total: { fontFamily: fonts.monoMedium, fontSize: 12.5 },
  barWrap: { paddingHorizontal: 2, paddingTop: 8, paddingBottom: 14 },
  track: { height: 6, borderRadius: 999, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999 },
  rows: { paddingHorizontal: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontFamily: fonts.regular, fontSize: 13 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  tok: { fontFamily: fonts.monoMedium, fontSize: 12 },
  cost: { fontFamily: fonts.semibold, fontSize: 11, color: GREEN },
  turn: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  turnLabel: { fontFamily: fonts.medium, fontSize: 12.5 },
  turnCost: { fontFamily: fonts.semibold, fontSize: 13, color: GREEN },
});
