import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "@/app-state/store";
import { ChatHeader } from "@/components/chat/chat-header";
import { Composer } from "@/components/chat/composer";
import { Conversation } from "@/components/chat/conversation";
import { EmptyState } from "@/components/chat/empty-state";
import { ModelSheet } from "@/components/chat/model-sheet";
import { VisibilitySheet } from "@/components/chat/visibility-sheet";
import { ContextSheet } from "@/components/chat/context-sheet";
import { ImageFullscreen } from "@/components/chat/image-fullscreen";
import { ArtifactViewer } from "@/components/chat/artifact-viewer";
import { ConfirmDialog } from "@/components/chat/confirm-dialog";
import { WalletScreen } from "@/components/wallet/wallet-screen";
import { SendSheet } from "@/components/wallet/send-sheet";
import { ReceiveSheet } from "@/components/wallet/receive-sheet";
import { SettingsScreen } from "@/components/settings/settings-screen";
import { PlansSheet } from "@/components/settings/plans-sheet";
import { ReferralSheet } from "@/components/settings/referral-sheet";
import { CustomSheet } from "@/components/settings/custom-sheet";
import { HandleSheet } from "@/components/settings/handle-sheet";
import { Drawer } from "@/components/nav/drawer";
import { AccountMenu } from "@/components/nav/account-menu";
import { NudgeDialog } from "@/components/chat/nudge-dialog";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// The single stateful shell (prototype's one `Component`). A `tab` swaps the
// content area in place; every non-tab surface is a sheet/overlay mounted once
// here (RN <Modal> portals them above the whole app). P1 ships the chat tab + its
// six sheets; P2 adds the wallet tab (home + Send/Receive sheets); P3 adds the
// settings tab and the navigation drawer that reaches every surface. (The
// prototype's Skills tab was removed 2026-07-12 — web-v3 main deleted its
// /skills surface in the store purge; skills are chat-native tools now.)
export default function Shell() {
  const { colors } = useTheme();
  const { tab, onboarded, onboardReady } = useAppState();

  // Hold on a blank bg until the persisted onboarded flag has been read, so a
  // returning user never sees a frame of onboarding before it snaps to chat.
  if (!onboardReady) {
    return <View style={[styles.root, { backgroundColor: colors.bg }]} />;
  }

  // First-launch takeover (prototype `onboarded:false`). The onboarding flow
  // owns its own safe-area insets; Receive stays mounted because the wallet-ready
  // step opens it (prototype comment: it overlays onboarding AND the wallet).
  if (!onboarded) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <OnboardingScreen />
        <ReceiveSheet />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        {tab === "chat" ? (
          <ChatTab />
        ) : tab === "wallet" ? (
          <WalletScreen />
        ) : tab === "settings" ? (
          <SettingsScreen />
        ) : (
          <Placeholder label={tab} />
        )}
      </SafeAreaView>

      {/* Non-tab surfaces — each portals above the shell via <Modal>. */}
      <Drawer />
      <ModelSheet />
      <VisibilitySheet />
      <ContextSheet />
      <ImageFullscreen />
      <ArtifactViewer />
      <ConfirmDialog />
      <SendSheet />
      <ReceiveSheet />
      <PlansSheet />
      <ReferralSheet />
      <CustomSheet />
      <HandleSheet />
      <AccountMenu />
      <NudgeDialog />
    </View>
  );
}

// The chat surface: header, the message thread (empty state until the first
// turn, then the conversation with its thinking / media placeholders), and the
// composer pinned to the bottom above the keyboard.
function ChatTab() {
  const { messages } = useAppState();
  const hasMessages = messages.length > 0;
  const insets = useSafeAreaInsets();
  // Keyboard lift. RN's KeyboardAvoidingView is a no-op on Android under
  // edge-to-edge (SDK 54+ forces it on, so the main window never resizes for the
  // IME), which left the composer covered by the keyboard (D2). Drive the content
  // up from the global Keyboard events instead — they fire regardless of which
  // window owns the input — shrinking the flex column by the keyboard height so
  // the bottom-pinned composer rises above it. Lift by the keyboard height minus
  // the bottom safe-area inset the composer already pads (that inset sits behind
  // the keyboard once it is up), leaving the same 8px gap the sheets use.
  const kbLift = useRef(new Animated.Value(0)).current;

  // Stick-to-bottom. Without it the thread stays where it was while a new turn
  // streams in below the fold — the user sends a message and sees nothing happen
  // (D24). web-v3 pins to the bottom the same way. `stick` turns OFF as soon as
  // the user scrolls up to read history, so a live stream never yanks them back.
  const scrollRef = useRef<ScrollView>(null);
  const stick = useRef(true);
  const STICK_SLOP = 80; // px from the bottom that still counts as "at the bottom"

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const fromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    stick.current = fromBottom <= STICK_SLOP;
  };

  // Sending re-arms the stick even if they had scrolled up: their own message is
  // what they want to see. A streamed assistant turn does not (that's `stick`).
  const lastRole = messages.at(-1)?.role;
  const count = messages.length;
  useEffect(() => {
    if (lastRole === "user") stick.current = true;
  }, [lastRole, count]);

  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const animateTo = (toValue: number, duration: number) =>
      Animated.timing(kbLift, {
        toValue,
        duration: duration || 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    const onShow = (e: KeyboardEvent) =>
      animateTo(Math.max(0, e.endCoordinates.height - insets.bottom), e.duration);
    const onHide = (e: KeyboardEvent) => animateTo(0, e.duration);
    const showSub = Keyboard.addListener(showEvt, onShow);
    const hideSub = Keyboard.addListener(hideEvt, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [kbLift, insets.bottom]);

  return (
    <View style={styles.flex}>
      <ChatHeader />
      <Animated.View style={[styles.flex, { paddingBottom: kbLift }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={hasMessages ? styles.thread : styles.emptyWrap}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          // Cheap enough for a stick check; not driving an animation.
          scrollEventThrottle={64}
          onContentSizeChange={() => {
            if (stick.current) scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          {hasMessages ? <Conversation /> : <EmptyState />}
        </ScrollView>
        <Composer />
      </Animated.View>
    </View>
  );
}

// P2/P3 stand-in for the wallet / settings tabs.
function Placeholder({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.placeholder}>
      <Text style={[styles.placeholderText, { color: colors.mutedFg }]}>
        {label[0].toUpperCase() + label.slice(1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  thread: { paddingHorizontal: 14, paddingBottom: 8 },
  emptyWrap: { flexGrow: 1, paddingHorizontal: 14 },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholderText: { fontFamily: fonts.semibold, fontSize: 18 },
});
