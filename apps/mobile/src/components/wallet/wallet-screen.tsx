import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppState } from "@/app-state/store";
import { openExternal, suiscanTxUrl } from "@/lib/audric-web";
import { timeAgo, useBalance, useTransactions } from "@/lib/wallet-data";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  Shield,
} from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// The wallet tab (prototype WALLET header + home). Balance card (spendable USDC +
// gas SUI) and recent-activity list are LIVE on-chain reads for the signed-in
// address (`useBalance` / `useTransactions`); "—" / an empty list show while
// loading or on a soft-fail. Receive / Send open their sheets (Send is a Phase-0
// mock). Reached from the drawer (P3).
export function WalletScreen() {
  const { colors } = useTheme();
  const { setTab, openReceive, openSend } = useAppState();
  const { usdc, sui } = useBalance();
  const { transactions } = useTransactions();

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => setTab("chat")} hitSlop={6} style={styles.back}>
          <ChevronLeft size={22} color={colors.fg} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.title, { color: colors.fg }]}>Wallet</Text>
        <View style={[styles.nonCustodial, { backgroundColor: colors.privBg }]}>
          <Shield size={11} color={colors.priv} strokeWidth={2} />
          <Text style={[styles.nonCustodialText, { color: colors.priv }]}>Non-custodial</Text>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.balCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.balRow}>
            <View style={styles.assetLabel}>
              <Text
                style={[styles.spendBadge, { color: colors.tealLabel, backgroundColor: colors.tealBg }]}
              >
                spendable
              </Text>
              <Text style={[styles.assetName, { color: colors.fg }]}>USDC</Text>
            </View>
            <Text style={[styles.balUsdc, { color: colors.fg }]}>
              {usdc != null ? usdc.toFixed(2) : "—"}
            </Text>
          </View>
          <View style={styles.balRow}>
            <View style={styles.assetLabel}>
              <Text
                style={[styles.gasBadge, { color: colors.mutedFg, backgroundColor: colors.muted }]}
              >
                gas
              </Text>
              <Text style={[styles.assetNameMuted, { color: colors.mutedFg }]}>SUI</Text>
            </View>
            <Text style={[styles.balSui, { color: colors.mutedFg }]}>
              {sui != null ? sui.toFixed(2) : "—"}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={openReceive}
            style={[styles.action, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ArrowDown size={20} color={colors.fg} strokeWidth={1.8} />
            <Text style={[styles.actionLabel, { color: colors.fg }]}>Receive</Text>
          </Pressable>
          <Pressable
            onPress={openSend}
            style={[styles.action, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ArrowUpRight size={20} color={colors.fg} strokeWidth={1.8} />
            <Text style={[styles.actionLabel, { color: colors.fg }]}>Send</Text>
          </Pressable>
        </View>

        <View>
          <Text style={[styles.sectionLabel, { color: colors.mutedFg }]}>RECENT ACTIVITY</Text>
          <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {transactions.length === 0 ? (
              <View style={styles.txEmpty}>
                <Text style={[styles.txEmptyText, { color: colors.mutedFg }]}>
                  No activity yet.
                </Text>
              </View>
            ) : (
              transactions.map((tx, i) => {
                const out = tx.direction === "out";
                const amt =
                  tx.amount != null ? `${out ? "−" : "+"}${tx.amount.toFixed(2)}` : "—";
                return (
                  <View
                    key={tx.digest}
                    style={[
                      styles.txRow,
                      i < transactions.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View style={[styles.txIcon, { backgroundColor: colors.muted }]}>
                      {out ? (
                        <ArrowUpRight size={15} color={colors.secondaryFg} strokeWidth={2} />
                      ) : (
                        <ArrowDownLeft size={15} color={colors.secondaryFg} strokeWidth={2} />
                      )}
                    </View>
                    <View style={styles.txMid}>
                      <Text numberOfLines={1} style={[styles.txLabel, { color: colors.fg }]}>
                        {tx.label}
                      </Text>
                      <View style={styles.txSub}>
                        <Text style={[styles.txTime, { color: colors.mutedFg }]}>
                          {timeAgo(tx.timestamp)}
                        </Text>
                        <Text style={[styles.txDot, { color: colors.mutedFg }]}>·</Text>
                        <Pressable
                          onPress={() => openExternal(suiscanTxUrl(tx.digest))}
                          hitSlop={6}
                          style={styles.txScan}
                        >
                          <Text style={[styles.txScanText, { color: colors.tealLabel }]}>
                            Suiscan
                          </Text>
                          <ArrowUpRight size={9} color={colors.tealLabel} strokeWidth={2.4} />
                        </Pressable>
                      </View>
                    </View>
                    <Text style={[styles.txAmt, { color: colors.fg }]}>{amt}</Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  back: { padding: 3, marginLeft: -3 },
  title: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.66 },
  nonCustodial: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  nonCustodialText: { fontFamily: fonts.medium, fontSize: 10.5 },
  body: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 36, gap: 14 },
  balCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16 },
  balRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 11,
  },
  assetLabel: { flexDirection: "row", alignItems: "center", gap: 7 },
  spendBadge: {
    fontFamily: fonts.semibold,
    fontSize: 9.5,
    letterSpacing: 0.19,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  gasBadge: {
    fontFamily: fonts.semibold,
    fontSize: 9.5,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  assetName: { fontFamily: fonts.regular, fontSize: 14 },
  assetNameMuted: { fontFamily: fonts.regular, fontSize: 14 },
  balUsdc: { fontFamily: fonts.monoSemibold, fontSize: 21 },
  balSui: { fontFamily: fonts.monoSemibold, fontSize: 15 },
  actions: { flexDirection: "row", gap: 10 },
  action: {
    flex: 1,
    alignItems: "center",
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 14,
  },
  actionLabel: { fontFamily: fonts.medium, fontSize: 13 },
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    letterSpacing: 0.74,
    marginTop: 8,
    marginBottom: 9,
    marginHorizontal: 2,
  },
  txCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden",
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  txIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  txMid: { flex: 1, minWidth: 0 },
  txLabel: { fontFamily: fonts.medium, fontSize: 13 },
  txSub: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  txTime: { fontFamily: fonts.regular, fontSize: 11 },
  txDot: { fontFamily: fonts.regular, fontSize: 11 },
  txScan: { flexDirection: "row", alignItems: "center", gap: 3 },
  txScanText: { fontFamily: fonts.regular, fontSize: 11 },
  txAmt: { fontFamily: fonts.monoSemibold, fontSize: 13 },
  txEmpty: { paddingVertical: 22, alignItems: "center" },
  txEmptyText: { fontFamily: fonts.regular, fontSize: 12.5 },
});
