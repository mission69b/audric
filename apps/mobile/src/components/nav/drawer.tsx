// The navigation drawer (prototype's slide-over left panel). Holds brand + close,
// New chat / Skills actions, the grouped chat history (each row with a Private /
// Public / Delete popover), and a footer with Wallet, Settings, and the account
// block (signed-in Passport tile → account menu, or a guest "Log in" nudge).
// Mirrors BottomSheet: RN <Modal> so it floats above the app, animates in ~220ms
// (slide from the left + scrim fade), closes instantly.

import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { USER_HANDLE } from "@/app-state/catalog";
import { SPENDABLE_USDC, useAppState } from "@/app-state/store";
import {
  AudricMark,
  ChevronUp,
  Globe,
  LogIn,
  Lock,
  Ellipsis,
  PanelLeft,
  Settings,
  SquarePen,
  Trash2,
  Wallet,
} from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

export function Drawer() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    drawerOpen,
    closeDrawer,
    newChat,
    setTab,
    history,
    openChat,
    deleteChat,
    chatMenu,
    openChatMenu,
    closeChatMenu,
    guest,
    openAccount,
    openNudge,
  } = useAppState();

  const panelWidth = Math.min(322, width * 0.84);
  const slide = useRef(new Animated.Value(1)).current; // 1 = offscreen-left, 0 = seated
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!drawerOpen) return;
    slide.setValue(1);
    fade.setValue(0);
    Animated.parallel([
      Animated.timing(slide, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [drawerOpen, slide, fade]);

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -panelWidth],
  });

  return (
    <Modal
      visible={drawerOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeDrawer}
    >
      <View style={styles.root}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: fade }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              backgroundColor: colors.sheet,
              paddingTop: insets.top + 10,
              paddingBottom: insets.bottom + 10,
              transform: [{ translateX }],
            },
          ]}
        >
          {/* Brand + close */}
          <View style={styles.brandRow}>
            <AudricMark size={18} color={colors.fg} />
            <Text style={[styles.brand, { color: colors.fg }]}>audric</Text>
            <Pressable onPress={closeDrawer} hitSlop={8} style={styles.brandClose}>
              <PanelLeft size={20} color={colors.mutedFg} strokeWidth={1.9} />
            </Pressable>
          </View>

          {/* Actions */}
          <Pressable onPress={newChat} style={styles.actionRow}>
            <SquarePen size={16} color={colors.fg} strokeWidth={1.9} />
            <Text style={[styles.actionText, { color: colors.fg }]}>New chat</Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* History — real DB-backed threads (see store `history`). Guests / a
              fresh account show the empty hint. */}
          <ScrollView style={styles.flex} contentContainerStyle={styles.histBody}>
            {history.length === 0 ? (
              <Text style={[styles.emptyHint, { color: colors.mutedFg }]}>
                {guest
                  ? "Guest mode — chats aren't saved."
                  : "No chats yet. Start a conversation."}
              </Text>
            ) : (
              history.map((grp) => (
                <View key={grp.group} style={styles.group}>
                  <Text style={[styles.groupLabel, { color: colors.mutedFg }]}>
                    {grp.group}
                  </Text>
                  {grp.items.map((conv) => (
                    <View key={conv.id}>
                      <View
                        style={[
                          styles.convRow,
                          conv.active && { backgroundColor: colors.secondary },
                        ]}
                      >
                        <Pressable
                          onPress={() => openChat(conv.id)}
                          style={styles.convHit}
                        >
                          <Text
                            numberOfLines={1}
                            style={[styles.convTitle, { color: conv.active ? colors.fg : colors.secondaryFg }]}
                          >
                            {conv.title}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => openChatMenu(conv.id)}
                          hitSlop={6}
                          style={styles.convMenuBtn}
                        >
                          <Ellipsis size={16} color={colors.mutedFg} strokeWidth={1.9} />
                        </Pressable>
                      </View>

                      {chatMenu === conv.id ? (
                        <View
                          style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}
                        >
                          <Pressable onPress={closeChatMenu} style={styles.menuRow}>
                            <Lock size={14} color={colors.secondaryFg} strokeWidth={1.8} />
                            <Text style={[styles.menuText, { color: colors.fg }]}>Private</Text>
                          </Pressable>
                          <Pressable onPress={closeChatMenu} style={styles.menuRow}>
                            <Globe size={14} color={colors.secondaryFg} strokeWidth={1.8} />
                            <Text style={[styles.menuText, { color: colors.fg }]}>Public</Text>
                          </Pressable>
                          <Pressable onPress={() => deleteChat(conv.id)} style={styles.menuRow}>
                            <Trash2 size={14} color="#ef4444" strokeWidth={1.8} />
                            <Text style={[styles.menuText, { color: "#ef4444" }]}>Delete</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ))
            )}
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable onPress={() => setTab("wallet")} style={styles.footRow}>
              <Wallet size={18} color={colors.fg} strokeWidth={1.8} />
              <Text style={[styles.footText, { color: colors.fg }]}>Wallet</Text>
              <View style={[styles.dot, { backgroundColor: colors.teal }]} />
              <Text style={[styles.footAmt, { color: colors.mutedFg }]}>
                {SPENDABLE_USDC.toFixed(2)}
              </Text>
            </Pressable>
            <Pressable onPress={() => setTab("settings")} style={styles.footRow}>
              <Settings size={18} color={colors.fg} strokeWidth={1.8} />
              <Text style={[styles.footText, { color: colors.fg }]}>Settings</Text>
            </Pressable>

            {guest ? (
              <Pressable
                onPress={openNudge}
                style={[styles.account, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <View style={[styles.guestTile, { backgroundColor: colors.secondary }]}>
                  <LogIn size={17} color={colors.fg} strokeWidth={1.9} />
                </View>
                <View style={styles.accountMid}>
                  <Text style={[styles.accountName, { color: colors.fg }]}>Log in</Text>
                  <Text style={[styles.accountSub, { color: colors.mutedFg }]}>
                    Guest — chats not saved
                  </Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                onPress={openAccount}
                style={[styles.account, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <View style={styles.avatar} />
                <View style={styles.accountMid}>
                  <Text style={[styles.accountName, { color: colors.fg }]}>{USER_HANDLE}</Text>
                  <Text style={[styles.accountSub, { color: colors.mutedFg }]}>Free plan</Text>
                </View>
                <ChevronUp size={16} color={colors.mutedFg} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, flexDirection: "row" },
  panel: {
    height: "100%",
    paddingHorizontal: 12,
  },

  brandRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 6, marginBottom: 12 },
  brand: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: -0.3 },
  brandClose: { marginLeft: "auto", padding: 3 },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  actionText: { fontFamily: fonts.medium, fontSize: 14 },

  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10, marginHorizontal: 4 },

  histBody: { paddingBottom: 8 },
  emptyHint: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    paddingHorizontal: 8,
    paddingVertical: 12,
    lineHeight: 18,
  },
  group: { marginBottom: 12 },
  groupLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    paddingHorizontal: 8,
    marginBottom: 5,
  },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingLeft: 8,
    paddingRight: 4,
  },
  convHit: { flex: 1, minWidth: 0, paddingVertical: 9 },
  convTitle: { fontFamily: fonts.regular, fontSize: 13.5 },
  convMenuBtn: { padding: 6 },

  menu: {
    marginTop: 3,
    marginHorizontal: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 4,
    overflow: "hidden",
  },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9, paddingHorizontal: 12 },
  menuText: { fontFamily: fonts.medium, fontSize: 13 },

  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 2 },
  footRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  footText: { fontFamily: fonts.medium, fontSize: 14 },
  dot: { width: 6, height: 6, borderRadius: 999, marginLeft: "auto" },
  footAmt: { fontFamily: fonts.monoMedium, fontSize: 12.5 },

  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 10,
    marginTop: 8,
  },
  avatar: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#0f766e" },
  guestTile: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  accountMid: { flex: 1, minWidth: 0 },
  accountName: { fontFamily: fonts.semibold, fontSize: 13.5 },
  accountSub: { fontFamily: fonts.regular, fontSize: 11.5, marginTop: 1 },
});
