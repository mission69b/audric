import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ChevronDown,
  Globe,
  Lock,
  PanelLeft,
  ShieldCheck,
  SquarePen,
} from "@/components/ui/icon";
import { useAppState } from "@/app-state/store";
import { useTheme } from "@/theme/theme";
import { fonts, space } from "@/theme/tokens";

// The chat top bar (prototype "CHAT HEADER"): drawer · Free-plan/Upgrade pill ·
// (spacer) · visibility toggle · privacy shield · new-chat. A bottom border
// separates it from the message list. 1:1 with the prototype markup + icons.
export function ChatHeader() {
  const { colors } = useTheme();
  const { openDrawer, openPlans, openVis, newChat, visibility } = useAppState();
  const isPrivate = visibility === "private";

  return (
    <View style={[styles.bar, { borderBottomColor: colors.border }]}>
      <Pressable onPress={openDrawer} hitSlop={6} style={styles.iconBtn}>
        <PanelLeft size={22} color={colors.fg} strokeWidth={1.9} />
      </Pressable>

      <Pressable
        onPress={openPlans}
        style={[styles.planPill, { borderColor: colors.border }]}
      >
        <Text style={[styles.planFree, { color: colors.mutedFg }]}>Free plan</Text>
        <Text style={[styles.planUp, { color: colors.fg }]}>Upgrade</Text>
      </Pressable>

      <Pressable onPress={openVis} hitSlop={6} style={styles.visBtn}>
        {isPrivate ? (
          <Lock size={15} color={colors.mutedFg} strokeWidth={1.9} />
        ) : (
          <Globe size={15} color={colors.mutedFg} strokeWidth={1.9} />
        )}
        <ChevronDown size={13} color={colors.mutedFg} strokeWidth={2} />
      </Pressable>

      <View style={styles.shield}>
        <ShieldCheck size={17} color={colors.priv} strokeWidth={1.9} />
      </View>

      <Pressable onPress={newChat} hitSlop={6} style={styles.iconBtn}>
        <SquarePen size={20} color={colors.mutedFg} strokeWidth={1.7} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { padding: 3 },
  planPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  planFree: { fontFamily: fonts.regular, fontSize: 11.5 },
  planUp: { fontFamily: fonts.semibold, fontSize: 11.5 },
  visBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  shield: { alignItems: "center", justifyContent: "center" },
});
