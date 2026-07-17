import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAppState } from "@/app-state/store";
import { ArrowUpRight, Check, TriangleAlert } from "@/components/ui/icon";
import { BottomSheet } from "@/components/ui/sheet";
import { openExternal, suiscanTxUrl } from "@/lib/audric-web";
import { useBalance } from "@/lib/wallet-data";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

const WARN_BG = "rgba(217,119,6,0.12)";
const WARN_BORDER = "rgba(217,119,6,0.32)";
const WARN_FG = "#b45309";
const SUCCESS = "#059669";
const ERROR = "#dc2626";

// Native SUI transfers pay gas from the SAME coin being sent, so draining the full
// balance leaves nothing for gas. Hold back a small buffer and refuse to send more
// than (balance - reserve). Conservative — a simple transfer's gas is far below this.
const GAS_RESERVE = 0.01; // SUI

// The Send bottom sheet. Four stages driven by the store's `stage`: confirm (recipient
// + amount inputs → approve), sending (spinner), success (REAL on-chain digest → Suiscan),
// error (failure reason + retry/close). Wired to the on-device zkLogin transfer via the
// store's `confirmSend` → `sendSui`. No mock.
export function SendSheet() {
  const { colors } = useTheme();
  const { sui, reload: reloadBalance } = useBalance();
  const {
    sendSheet,
    closeSend,
    stage,
    amount,
    amountText,
    setAmountText,
    recipientInput,
    setRecipientInput,
    resolvedTo,
    digest,
    sendError,
    confirmSend,
    retrySend,
  } = useAppState();

  // Refetch the balance every time the sheet opens. `useBalance` otherwise only
  // reloads when the address/token change (once, at sign-in), so a wallet funded
  // AFTER sign-in would show a stale balance here — blocking an otherwise-valid send
  // with a false "insufficient balance". The sheet is always mounted (visibility is a
  // prop), so opening it is the only signal that the balance should be re-read.
  useEffect(() => {
    if (sendSheet) reloadBalance();
  }, [sendSheet, reloadBalance]);

  // Block the send when the amount would leave no gas headroom OR when the balance is
  // unknown (RPC failed → sui == null): sending blind against an unknown balance could
  // silently overspend. Only evaluated once a positive amount is entered so the warning
  // doesn't flash while the balance is still loading.
  const insufficient = amount > 0 && (sui == null || amount > sui - GAS_RESERVE);
  const canSend = recipientInput.trim().length > 0 && amount > 0 && !insufficient;
  // A broadcast is in flight — block dismissal (scrim tap / swipe / Android back) so a
  // send can't be backgrounded into an untracked state.
  const dismissable = stage !== "sending";
  const recipientLabel = resolvedTo
    ? `${resolvedTo.slice(0, 10)}…${resolvedTo.slice(-4)}`
    : recipientInput;

  return (
    <BottomSheet
      visible={sendSheet}
      onClose={dismissable ? closeSend : () => {}}
      maxHeightRatio={0.9}
    >
      {stage === "confirm" ? (
        <View style={styles.pad}>
          <Text style={[styles.title, { color: colors.fg }]}>Confirm payment</Text>
          <Text style={[styles.sub, { color: colors.mutedFg }]}>
            Review and approve this transfer.
          </Text>

          <View style={styles.amountWrap}>
            <Text style={[styles.amountLabel, { color: colors.mutedFg }]}>AMOUNT</Text>
            <View style={styles.amountValue}>
              <TextInput
                style={[styles.amountInput, { color: colors.fg }]}
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.mutedFg}
              />
              <Text style={[styles.amountUnit, { color: colors.mutedFg }]}>SUI</Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View
              style={[
                styles.cardRow,
                { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <Text style={[styles.rowKey, { color: colors.mutedFg }]}>To</Text>
              <TextInput
                style={[styles.recipientInput, { color: colors.fg }]}
                value={recipientInput}
                onChangeText={setRecipientInput}
                placeholder="0x… or name.sui"
                placeholderTextColor={colors.mutedFg}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {resolvedTo ? (
              <View style={styles.cardRow}>
                <Text style={[styles.rowKey, { color: colors.mutedFg }]}>Resolved</Text>
                <View style={styles.rowVal}>
                  <Text style={[styles.recipient, { color: colors.fg }]}>{recipientLabel}</Text>
                  <Check size={14} color={SUCCESS} strokeWidth={2.4} />
                </View>
              </View>
            ) : null}
          </View>

          {insufficient ? (
            <View style={styles.warnBanner}>
              <TriangleAlert size={16} color={WARN_FG} strokeWidth={2} />
              <Text style={styles.warnText}>
                Amount exceeds your {sui != null ? sui.toFixed(4) : "0"} SUI balance.
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
            {amount} SUI → {recipientLabel}
          </Text>
        </View>
      ) : stage === "success" ? (
        <View style={styles.statusWrap}>
          <View style={[styles.successCircle, { backgroundColor: SUCCESS }]}>
            <Check size={28} color="#fff" strokeWidth={2.6} />
          </View>
          <Text style={[styles.successTitle, { color: colors.fg }]}>Sent {amount} SUI</Text>
          <Text style={[styles.statusSub, { color: colors.mutedFg }]}>to {recipientLabel}</Text>
          {digest ? (
            <Pressable style={styles.digestRow} onPress={() => openExternal(suiscanTxUrl(digest))}>
              <Text style={[styles.digest, { color: colors.tealLabel }]}>
                {`${digest.slice(0, 10)}…${digest.slice(-6)}`}
              </Text>
              <ArrowUpRight size={13} color={colors.tealLabel} strokeWidth={2.2} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={closeSend}
            style={[styles.btn, styles.doneBtn, { backgroundColor: colors.fg }]}
          >
            <Text style={[styles.btnText, { color: colors.bg }]}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.statusWrap}>
          <View style={[styles.successCircle, { backgroundColor: ERROR }]}>
            <TriangleAlert size={26} color="#fff" strokeWidth={2.4} />
          </View>
          <Text style={[styles.successTitle, { color: colors.fg }]}>Send failed</Text>
          <Text style={[styles.statusSub, styles.errorMsg, { color: colors.mutedFg }]}>
            {sendError ?? "Something went wrong."}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={closeSend}
              style={[styles.btn, styles.denyBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.btnText, { color: colors.fg }]}>Close</Text>
            </Pressable>
            <Pressable onPress={retrySend} style={[styles.btn, { backgroundColor: colors.fg }]}>
              <Text style={[styles.btnText, { color: colors.bg }]}>Retry</Text>
            </Pressable>
          </View>
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
  amountValue: { flexDirection: "row", alignItems: "baseline", gap: 7, marginTop: 10 },
  amountInput: {
    fontFamily: fonts.monoSemibold,
    fontSize: 34,
    letterSpacing: -0.68,
    fontVariant: ["tabular-nums"],
    minWidth: 60,
    textAlign: "right",
    padding: 0,
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
  recipientInput: {
    flex: 1,
    marginLeft: 16,
    fontFamily: fonts.monoMedium,
    fontSize: 13,
    textAlign: "right",
    padding: 0,
  },
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
  errorMsg: { textAlign: "center", paddingHorizontal: 20 },
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
