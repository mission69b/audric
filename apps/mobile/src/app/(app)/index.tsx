import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { SkillsScreen } from "@/components/skills/skills-screen";
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
// settings + skills tabs and the navigation drawer that reaches every surface.
export default function Shell() {
  const { colors } = useTheme();
  const { tab, onboarded } = useAppState();

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
        ) : tab === "skills" ? (
          <SkillsScreen />
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

  return (
    <View style={styles.flex}>
      <ChatHeader />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={hasMessages ? styles.thread : styles.emptyWrap}
          keyboardShouldPersistTaps="handled"
        >
          {hasMessages ? <Conversation /> : <EmptyState />}
        </ScrollView>
        <Composer />
      </KeyboardAvoidingView>
    </View>
  );
}

// P2/P3 stand-in for the wallet / settings / skills tabs.
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
