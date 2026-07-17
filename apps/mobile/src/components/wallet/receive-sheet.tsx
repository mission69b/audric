import { Pressable, StyleSheet, Text, View } from "react-native";
import { QR_CELLS } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import { useAuth } from "@/auth/useAuth";
import { CopyPill } from "@/components/ui/copy-pill";
import { X } from "@/components/ui/icon";
import { BottomSheet } from "@/components/ui/sheet";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// QR geometry: the prototype box is 196×196 with 13px padding + 1px border, so the
// 21×21 matrix fills ~168px → 8px per module. Dark modules paint #0b0b0b on white.
const QR_MODULE = 8;
const QR_DARK = "#0b0b0b";

// The Receive bottom sheet (prototype RECEIVE SHEET). The address shown/copied is
// the REAL signed-in wallet address (session.address) — never a catalog constant —
// so a deposit can never land at a stale placeholder address. Copy writes it to the
// clipboard. (The QR matrix is still the prototype's fixed pattern; it is decorative
// and does NOT encode the address — copy is the funded path.)
export function ReceiveSheet() {
  const { colors } = useTheme();
  const { receiveSheet, closeReceive } = useAppState();
  const { session } = useAuth();
  const address = session?.address ?? "";

  return (
    <BottomSheet visible={receiveSheet} onClose={closeReceive} maxHeightRatio={0.9}>
      <View style={styles.pad}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={[styles.title, { color: colors.fg }]}>Receive USDC</Text>
            <Text style={[styles.sub, { color: colors.mutedFg }]}>
              Scan or copy your wallet address.
            </Text>
          </View>
          <Pressable
            onPress={closeReceive}
            hitSlop={8}
            style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
          >
            <X size={14} color={colors.mutedFg} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={[styles.qrBox, { borderColor: colors.border }]}>
            <View style={styles.qrGrid}>
              {QR_CELLS.map((dark, i) => (
                <View
                  key={i}
                  style={[styles.qrCell, dark && { backgroundColor: QR_DARK }]}
                />
              ))}
            </View>
          </View>

          <View style={[styles.addrBar, { backgroundColor: colors.muted }]}>
            <Text numberOfLines={1} style={[styles.addr, { color: colors.secondaryFg }]}>
              {address}
            </Text>
            <CopyPill value={address} />
          </View>

          <Text style={[styles.note, { color: colors.mutedFg }]}>
            Send only Sui-network USDC to this address.
          </Text>
        </View>
      </View>
    </BottomSheet>
  );
}

const QR_SIDE = QR_MODULE * 21;

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 4, paddingTop: 6, paddingBottom: 26 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headText: { flex: 1 },
  title: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.34 },
  sub: { fontFamily: fonts.regular, fontSize: 12.5, marginTop: 3 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { alignItems: "center", gap: 16, paddingTop: 18 },
  qrBox: {
    width: 196,
    height: 196,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 13,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  qrGrid: {
    width: QR_SIDE,
    height: QR_SIDE,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  qrCell: { width: QR_MODULE, height: QR_MODULE },
  addrBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  addr: { flex: 1, minWidth: 0, fontFamily: fonts.monoMedium, fontSize: 12 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  copyText: { fontFamily: fonts.semibold, fontSize: 12 },
  note: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 16.5, textAlign: "center" },
});
