import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { COMING_SOON, EVERY_PLAN, TIERS } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import { openAudricWeb } from "@/lib/audric-web";
import { BottomSheet } from "@/components/ui/sheet";
import { Check, X } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// The Plans sheet (prototype PLANS). Opened from Settings → billing "View plans"
// and the account menu "Upgrade plan". Lists the every-plan value card, the three
// tiers (Free / Pro / Max, Free = current) with their CTA states, and a
// coming-soon card. Tier data mirrors web-v3 lib/credit/tiers.ts verbatim.
export function PlansSheet() {
  const { colors } = useTheme();
  const { plansSheet, closePlans } = useAppState();

  return (
    <BottomSheet visible={plansSheet} onClose={closePlans} maxHeightRatio={0.9}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.fg }]}>Plans</Text>
        <Pressable onPress={closePlans} hitSlop={8} style={[styles.close, { backgroundColor: colors.secondary }]}>
          <X size={14} color={colors.mutedFg} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Included in every plan */}
        <View style={[styles.everyCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[styles.everyTitle, { color: colors.fg }]}>
            Included in every plan <Text style={[styles.everyTitleSub, { color: colors.mutedFg }]}>— Free included</Text>
          </Text>
          <View style={styles.everyList}>
            {EVERY_PLAN.map((t) => (
              <View key={t} style={styles.checkRow}>
                <Check size={14} color={colors.tealLabel} strokeWidth={2.2} style={styles.checkIcon} />
                <Text style={[styles.checkText, { color: colors.mutedFg }]}>{t}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Tiers */}
        {TIERS.map((t) => (
          <View
            key={t.id}
            style={[
              styles.tier,
              {
                backgroundColor: colors.card,
                borderWidth: t.featured ? 1.5 : StyleSheet.hairlineWidth,
                borderColor: t.featured ? colors.teal : colors.border,
              },
            ]}
          >
            {t.popular ? (
              <Text style={[styles.popular, { color: "#fff", backgroundColor: colors.tealLabel }]}>POPULAR</Text>
            ) : null}
            <View style={styles.tierHead}>
              <Text style={[styles.tierName, { color: colors.fg }]}>{t.name}</Text>
              <Text style={[styles.tierPrice, { color: colors.fg }]}>
                {t.hasOriginal ? (
                  <Text style={[styles.orig, { color: colors.mutedFg }]}>{t.origLabel} </Text>
                ) : null}
                {t.priceLabel}
                <Text style={[styles.per, { color: colors.mutedFg }]}>{t.per}</Text>
              </Text>
            </View>
            {t.beta ? (
              <Text style={[styles.beta, { color: colors.tealLabel, backgroundColor: colors.tealBg }]}>
                BETA · 50% OFF
              </Text>
            ) : null}
            <Text style={[styles.tagline, { color: colors.mutedFg }]}>{t.tagline}</Text>
            <View style={styles.tierFeats}>
              {t.feats.map((f) => (
                <View key={f} style={styles.checkRow}>
                  <Check size={14} color={colors.tealLabel} strokeWidth={2.2} style={styles.checkIcon} />
                  <Text style={[styles.checkText, { color: colors.secondaryFg }]}>{f}</Text>
                </View>
              ))}
            </View>
            {/* Current plan is a static badge; upgrading is a fiat/Stripe action,
                so the CTA hands off to audric.ai (see lib/audric-web). */}
            <Pressable
              onPress={t.current ? undefined : () => openAudricWeb()}
              style={[
                styles.cta,
                t.current
                  ? { backgroundColor: colors.muted }
                  : t.featured
                    ? { backgroundColor: colors.tealLabel }
                    : { backgroundColor: "transparent", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.ctaText,
                  { color: t.current ? colors.mutedFg : t.featured ? "#fff" : colors.fg },
                ]}
              >
                {t.cta}
              </Text>
            </Pressable>
          </View>
        ))}

        <Text style={[styles.manageNote, { color: colors.mutedFg }]}>
          Plans are billed &amp; managed on audric.ai. Crypto top-up (USDC/USDsui)
          stays in-app.
        </Text>

        {/* Coming soon */}
        <View style={[styles.coming, { borderColor: colors.border }]}>
          <Text style={[styles.comingLabel, { color: colors.mutedFg }]}>COMING SOON</Text>
          {COMING_SOON.map((t) => (
            <View key={t} style={styles.dotRow}>
              <Text style={[styles.dot, { color: colors.mutedFg }]}>·</Text>
              <Text style={[styles.checkText, { color: colors.mutedFg }]}>{t}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingBottom: 10,
  },
  title: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.34 },
  close: { width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center" },

  body: { paddingBottom: 20, gap: 14 },

  everyCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 15 },
  everyTitle: { fontFamily: fonts.semibold, fontSize: 13 },
  everyTitleSub: { fontFamily: fonts.regular, fontSize: 12 },
  everyList: { gap: 9, marginTop: 11 },

  checkRow: { flexDirection: "row", gap: 9 },
  checkIcon: { marginTop: 1 },
  checkText: { flex: 1, fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 17.25 },

  tier: { borderRadius: 16, padding: 16, position: "relative" },
  popular: {
    position: "absolute",
    top: -9,
    left: 16,
    fontFamily: fonts.semibold,
    fontSize: 9,
    letterSpacing: 0.45,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  tierHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  tierName: { fontFamily: fonts.semibold, fontSize: 18 },
  tierPrice: { fontFamily: fonts.semibold, fontSize: 16 },
  orig: { fontFamily: fonts.regular, fontSize: 12, textDecorationLine: "line-through" },
  per: { fontFamily: fonts.regular, fontSize: 12 },
  beta: {
    alignSelf: "flex-start",
    marginTop: 8,
    fontFamily: fonts.semibold,
    fontSize: 9,
    letterSpacing: 0.36,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  tagline: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 12 },
  tierFeats: { gap: 8, marginBottom: 14 },
  cta: { borderRadius: 11, paddingVertical: 11, alignItems: "center" },
  ctaText: { fontFamily: fonts.semibold, fontSize: 13 },
  manageNote: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16.5,
    textAlign: "center",
    marginHorizontal: 8,
  },

  coming: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  comingLabel: { fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 0.74 },
  dotRow: { flexDirection: "row", gap: 9 },
  dot: { fontFamily: fonts.regular, fontSize: 11.5 },
});
