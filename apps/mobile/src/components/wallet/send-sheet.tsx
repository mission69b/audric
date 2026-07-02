import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SEND_DIGEST } from "@/app-state/catalog";
import { SPENDABLE_USDC, useAppState } from "@/app-state/store";
import { ArrowUpRight, Check, ChevronsUpDown, TriangleAlert } from "@/components/ui/icon";
import { BottomSheet } from "@/components/ui/sheet";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

const WARN_BG = "rgba(217,119,6,0.12)";
const WARN_BORDER = "rgba(217,119,6,0.32)";
const WARN_FG = "#b45309";
const SUCCESS = "#059669";
const USDC_BLUE = "#2775ca";

// The Send bottom sheet (prototype SEND SHEET). Three stages driven by the store's
// `stage`: confirm (amount stepper + recipient/asset review + approve), sending
// (spinner), success (digest + Done). Mock only — `confirmSend` fakes the transfer.
export function SendSheet() {
  const { colors } = useTheme();
  const {
    sendSheet,
    closeSend,
    stage,
    amount,
    incAmount,
    decAmount,
    recipient,
    toggleRecipient,
    confirmSend,
  } = useAppState();

  const amountStr = amount.toFixed(2);
  const insufficient = amount > SPENDABLE_USDC;
  const canSend = !insufficient;

  return (
    <BottomSheet visible={sendSheet} onClose={closeSend} maxHeightRatio={0.9}>
      {stage === "confirm" ? (
        <View style={styles.pad}>
          <Text style={[styles.title, { color: colors.fg }]}>Confirm payment</Text>
          <Text style={[styles.sub, { color: colors.mutedFg }]}>
            Review and approve this transfer.
          </Text>

          <View style={styles.amountWrap}>
            <Text style={[styles.amountLabel, { color: colors.mutedFg }]}>AMOUNT</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={decAmount}
                style={[styles.stepBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.stepGlyph, { color: colors.fg }]}>−</Text>
              </Pressable>
              <View style={styles.amountValue}>
                <Text style={[styles.amountNum, { color: colors.fg }]}>{amountStr}</Text>
                <Text style={[styles.amountUnit, { color: colors.mutedFg }]}>USDC</Text>
              </View>
              <Pressable
                onPress={incAmount}
                style={[styles.stepBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.stepGlyph, { color: colors.fg }]}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable
              onPress={toggleRecipient}
              style={[styles.cardRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <Text style={[styles.rowKey, { color: colors.mutedFg }]}>To</Text>
              <View style={styles.rowVal}>
                <Text style={[styles.recipient, { color: colors.fg }]}>{recipient}</Text>
                <ChevronsUpDown size={15} color={colors.mutedFg} strokeWidth={2} />
              </View>
            </Pressable>
            <View style={styles.cardRow}>
              <Text style={[styles.rowKey, { color: colors.mutedFg }]}>Asset</Text>
              <View style={styles.rowVal}>
                <View style={[styles.usdcBadge, { backgroundColor: USDC_BLUE }]}>
                  <Text style={styles.usdcBadgeText}>$</Text>
                </View>
                <Text style={[styles.assetName, { color: colors.fg }]}>USDC</Text>
              </View>
            </View>
          </View>

          {insufficient ? (
            <View style={styles.warnBanner}>
              <TriangleAlert size={16} color={WARN_FG} strokeWidth={2} />
              <Text style={styles.warnText}>
                Amount exceeds your 124.50 USDC spendable balance.
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={closeSend}
              style={[styles.btn, styles.denyBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.btnText, { color: colors.fg }]}>Deny</Text>
            </Pressable>
            {canSend ? (
              <Pressable onPress={confirmSend} style={[styles.btn, { backgroundColor: colors.fg }]}>
                <Text style={[styles.btnText, { color: colors.bg }]}>Allow &amp; Send</Text>
              </Pressable>
            ) : (
              <View style={[styles.btn, { backgroundColor: colors.muted }]}>
                <Text style={[styles.btnText, { color: colors.mutedFg }]}>Allow &amp; Send</Text>
              </View>
            )}
          </View>
        </View>
      ) : stage === "sending" ? (
        <View style={styles.statusWrap}>
          <ActivityIndicator size="large" color={colors.fg} />
          <Text style={[styles.statusTitle, { color: colors.fg }]}>Sending payment…</Text>
          <Text style={[styles.statusSub, { color: colors.mutedFg }]}>
            {amountStr} USDC → {recipient}
          </Text>
        </View>
      ) : (
        <View style={styles.statusWrap}>
          <View style={[styles.successCircle, { backgroundColor: SUCCESS }]}>
            <Check size={28} color="#fff" strokeWidth={2.6} />
          </View>
          <Text style={[styles.successTitle, { color: colors.fg }]}>Sent {amountStr} USDC</Text>
          <Text style={[styles.statusSub, { color: colors.mutedFg }]}>to {recipient}</Text>
          <View style={styles.digestRow}>
            <Text style={[styles.digest, { color: colors.tealLabel }]}>{SEND_DIGEST}</Text>
            <ArrowUpRight size={13} color={colors.tealLabel} strokeWidth={2.2} />
          </View>
          <Pressable
            onPress={closeSend}
            style={[styles.btn, styles.doneBtn, { backgroundColor: colors.fg }]}
          >
            <Text style={[styles.btnText, { color: colors.bg }]}>Done</Text>
          </Pressable>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 4, paddingTop: 6, paddingBottom: 26 },
  title: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.34 },
  sub: { fontFamily: fonts.regular, fontSize: 12.5, marginTop: 3 },
  amountWrap: { alignItems: "center", paddingTop: 18, paddingBottom: 6 },
  amountLabel: { fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 0.63 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 10 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  stepGlyph: { fontFamily: fonts.regular, fontSize: 22, lineHeight: 26 },
  amountValue: { flexDirection: "row", alignItems: "baseline", gap: 7 },
  amountNum: {
    fontFamily: fonts.monoSemibold,
    fontSize: 34,
    letterSpacing: -0.68,
    fontVariant: ["tabular-nums"],
  },
  amountUnit: { fontFamily: fonts.semibold, fontSize: 14 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 8,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowKey: { fontFamily: fonts.regular, fontSize: 13 },
  rowVal: { flexDirection: "row", alignItems: "center", gap: 7 },
  recipient: { fontFamily: fonts.monoMedium, fontSize: 13 },
  usdcBadge: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  usdcBadgeText: { fontFamily: fonts.bold, fontSize: 9, color: "#fff" },
  assetName: { fontFamily: fonts.medium, fontSize: 13 },
  warnBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: WARN_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: WARN_BORDER,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  warnText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16.8,
    color: WARN_FG,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  denyBtn: { borderWidth: StyleSheet.hairlineWidth },
  btnText: { fontFamily: fonts.semibold, fontSize: 13.5 },
  statusWrap: {
    paddingHorizontal: 4,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: "center",
    gap: 14,
  },
  statusTitle: { fontFamily: fonts.semibold, fontSize: 15 },
  statusSub: { fontFamily: fonts.regular, fontSize: 12.5 },
  successCircle: {
    width: 54,
    height: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  digestRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  digest: { fontFamily: fonts.monoSemibold, fontSize: 12.5 },
  doneBtn: { alignSelf: "stretch", flex: 0, marginTop: 6 },
});
