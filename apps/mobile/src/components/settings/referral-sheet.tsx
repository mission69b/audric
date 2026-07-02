import { StyleSheet, Text, View } from "react-native";
import { REFERRAL_LINK, REFERRAL_STATS } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import { BottomSheet } from "@/components/ui/sheet";
import { Gift, Share2, X } from "@/components/ui/icon";
import { Pressable } from "react-native";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// Refer & earn sheet (prototype REFERRAL). Give $10 / get $10 — share link + the
// user's referral stats. Demo figures from the catalog; Share is presentational.
export function ReferralSheet() {
  const { colors } = useTheme();
  const { referralSheet, closeReferral } = useAppState();

  return (
    <BottomSheet visible={referralSheet} onClose={closeReferral} maxHeightRatio={0.9}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={[styles.tile, { backgroundColor: colors.tealBg }]}>
            <Gift size={16} color={colors.tealLabel} strokeWidth={1.8} />
          </View>
          <Text style={[styles.title, { color: colors.fg }]}>Refer &amp; earn</Text>
        </View>
        <Pressable onPress={closeReferral} hitSlop={8} style={[styles.close, { backgroundColor: colors.secondary }]}>
          <X size={14} color={colors.mutedFg} strokeWidth={2.2} />
        </Pressable>
      </View>

      <Text style={[styles.desc, { color: colors.mutedFg }]}>
        Give $10, get $10. Share your link — when a friend joins and makes their
        first purchase, you both get $10 in credits.
      </Text>

      <View style={styles.linkRow}>
        <View style={[styles.linkBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text numberOfLines={1} style={[styles.link, { color: colors.fg }]}>{REFERRAL_LINK}</Text>
        </View>
        <View style={[styles.shareBtn, { backgroundColor: colors.tealLabel }]}>
          <Share2 size={14} color="#fff" strokeWidth={2} />
          <Text style={styles.shareText}>Share</Text>
        </View>
      </View>

      <View style={styles.stats}>
        {REFERRAL_STATS.map((s) => (
          <View key={s.label} style={[styles.stat, { backgroundColor: colors.muted }]}>
            <Text style={[styles.statValue, { color: s.teal ? colors.tealLabel : colors.fg }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedFg }]}>{s.label}</Text>
          </View>
        ))}
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
    paddingBottom: 4,
  },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 9 },
  tile: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  close: { width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center" },

  desc: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 19.4, paddingVertical: 12, paddingHorizontal: 2 },

  linkRow: { flexDirection: "row", gap: 8, paddingHorizontal: 2, paddingBottom: 12 },
  linkBox: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  link: { fontFamily: fonts.monoMedium, fontSize: 12 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  shareText: { fontFamily: fonts.semibold, fontSize: 12.5, color: "#fff" },

  stats: { flexDirection: "row", gap: 9, paddingHorizontal: 2, paddingBottom: 6 },
  stat: { flex: 1, borderRadius: 13, paddingVertical: 12, paddingHorizontal: 10, alignItems: "center" },
  statValue: { fontFamily: fonts.monoSemibold, fontSize: 20, fontVariant: ["tabular-nums"] },
  statLabel: { fontFamily: fonts.medium, fontSize: 10.5, marginTop: 2 },
});
