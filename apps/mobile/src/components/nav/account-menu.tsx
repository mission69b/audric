import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CREDIT_USD, HELP_ITEMS } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import { useAuth } from "@/auth/useAuth";
import { HELP_LINKS, openExternal } from "@/lib/audric-web";
import { displayHandle, shortAddress } from "@/lib/identity";
import { useBalance } from "@/lib/wallet-data";
import { BottomSheet } from "@/components/ui/sheet";
import { PassportAvatar } from "@/components/ui/passport-avatar";
import { ChevronDown, ChevronRight, CreditCard, HelpCircle, LogOut, Moon, Settings, Sun } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

const SIGNOUT = "#dc2626";

// Account menu (prototype ACCOUNT sheet), opened from the drawer footer. Passport
// identity header, a three-up stats strip, and the account actions. Sign out is
// wired to the real auth backend (clears the stored session via useAuth).
export function AccountMenu() {
  const { colors, isDark, toggle } = useTheme();
  const { accountMenu, closeAccount, setTab, openPlans } = useAppState();
  const { session, signOut } = useAuth();
  const { usdc } = useBalance();
  const [helpOpen, setHelpOpen] = useState(false);

  const goSettings = () => {
    closeAccount();
    setTab("settings");
  };
  const goPlans = () => {
    closeAccount();
    openPlans();
  };

  return (
    <BottomSheet visible={accountMenu} onClose={closeAccount} maxHeightRatio={0.9}>
      <View style={styles.idRow}>
        <PassportAvatar size={40} />
        <View style={styles.idText}>
          <Text style={[styles.handle, { color: colors.fg }]}>{displayHandle(session)}</Text>
          <Text style={[styles.addr, { color: colors.mutedFg }]}>{shortAddress(session?.address)}</Text>
        </View>
      </View>

      <View style={[styles.stats, { borderColor: colors.border }]}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.fg }]}>Free</Text>
          <Text style={[styles.statLabel, { color: colors.mutedFg }]}>Plan</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValueMono, { color: colors.fg }]}>${CREDIT_USD}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedFg }]}>Credits</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValueMono, { color: colors.tealLabel }]}>
            {usdc != null ? usdc.toFixed(2) : "—"}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedFg }]}>Passport USDC</Text>
        </View>
      </View>

      <View style={styles.list}>
        <Row icon={<Settings size={18} color={colors.mutedFg} strokeWidth={1.8} />} label="Settings" onPress={goSettings} colors={colors} />
        <Row icon={<CreditCard size={18} color={colors.mutedFg} strokeWidth={1.8} />} label="Upgrade plan" onPress={goPlans} colors={colors} />

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Row
          icon={isDark ? <Sun size={18} color={colors.mutedFg} strokeWidth={1.8} /> : <Moon size={18} color={colors.mutedFg} strokeWidth={1.8} />}
          label="Toggle dark mode"
          onPress={toggle}
          colors={colors}
        />

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Row
          icon={<HelpCircle size={18} color={colors.mutedFg} strokeWidth={1.8} />}
          label="Help"
          onPress={() => setHelpOpen((v) => !v)}
          colors={colors}
          right={helpOpen ? <ChevronDown size={16} color={colors.mutedFg} strokeWidth={2} /> : <ChevronRight size={16} color={colors.mutedFg} strokeWidth={2} />}
        />
        {helpOpen ? (
          <View style={[styles.submenu, { borderColor: colors.border }]}>
            {HELP_ITEMS.map((h) => (
              <Pressable
                key={h}
                style={styles.subRow}
                onPress={() => {
                  const url = HELP_LINKS[h];
                  if (url) openExternal(url);
                }}
              >
                <Text style={[styles.subLabel, { color: colors.mutedFg }]}>{h}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Row
          icon={<LogOut size={18} color={SIGNOUT} strokeWidth={1.8} />}
          label="Sign out"
          labelColor={SIGNOUT}
          onPress={() => {
            closeAccount();
            void signOut();
          }}
          colors={colors}
        />
      </View>
    </BottomSheet>
  );
}

function Row({
  icon,
  label,
  labelColor,
  onPress,
  right,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  labelColor?: string;
  onPress: () => void;
  right?: React.ReactNode;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={[styles.rowLabel, { color: labelColor ?? colors.fg }]}>{label}</Text>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  idRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 2, paddingBottom: 14 },
  idText: { flex: 1, minWidth: 0 },
  handle: { fontFamily: fonts.semibold, fontSize: 14 },
  addr: { fontFamily: fonts.regular, fontSize: 11.5, marginTop: 1 },

  stats: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  stat: { flex: 1, alignItems: "center", gap: 3 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", marginVertical: 4 },
  statValue: { fontFamily: fonts.semibold, fontSize: 14 },
  statValueMono: { fontFamily: fonts.monoMedium, fontSize: 14, fontVariant: ["tabular-nums"] },
  statLabel: { fontFamily: fonts.regular, fontSize: 10.5 },

  list: { paddingTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  rowIcon: { width: 20, alignItems: "center" },
  rowLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 14 },
  rowRight: { marginLeft: "auto" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },

  submenu: { borderLeftWidth: 1.5, marginLeft: 10, paddingLeft: 16 },
  subRow: { paddingVertical: 9 },
  subLabel: { fontFamily: fonts.regular, fontSize: 13 },
});
