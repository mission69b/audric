import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppState } from "@/app-state/store";
import { BottomSheet } from "@/components/ui/sheet";
import { Gift, X } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// Refer & earn sheet (prototype REFERRAL). Referrals are NOT wired on mobile — there
// is no referral backend here yet, and the prototype's link (`audric.ai/r/you-a1b2`)
// + stats (3 referrals / $30 earned / #142 rank) were hardcoded fabrications shown as
// if they were this user's real figures. Rather than surface a fake personal link and
// a live-looking Share button, this sheet is an honest "coming soon": it describes the
// offer without inventing per-user data. Re-enable with the real thing when the referral
// service lands (web-v3 issues codes via `REFERRAL_ALPHABET` in `lib/db/queries.ts`).
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
        Give $10, get $10. When a friend joins Audric and makes their first
        purchase, you'll both get $10 in credits.
      </Text>

      <View style={styles.soonRow}>
        <View style={[styles.soonBadge, { backgroundColor: colors.tealBg }]}>
          <Text style={[styles.soonBadgeText, { color: colors.tealLabel }]}>Coming soon</Text>
        </View>
      </View>

      <Text style={[styles.soonNote, { color: colors.mutedFg }]}>
        Your personal referral link and rewards will appear here in an upcoming
        release.
      </Text>
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

  soonRow: { flexDirection: "row", paddingHorizontal: 2, paddingTop: 2, paddingBottom: 10 },
  soonBadge: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  soonBadgeText: { fontFamily: fonts.semibold, fontSize: 11.5, letterSpacing: 0.2 },
  soonNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
});
