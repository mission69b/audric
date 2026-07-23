import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/useAuth";
import { AudricMark, GoogleG } from "@/components/ui/icon";
import {
  AUDRIC_PRIVACY_URL,
  AUDRIC_TERMS_URL,
  openAudricWeb,
} from "@/lib/audric-web";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// Signed-out sign-in screen (prototype OnboardScreen "Welcome"). Continue with
// Google → a non-custodial Sui wallet is derived on-device (no seed phrase, no
// passwords). This is the single real sign-in surface; the post-login onboarding
// deck no longer re-asks. The "signing-in" state shows the wallet-creation
// progress, matching the web app's zkLogin handoff.
export default function GateScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, error, signIn } = useAuth();

  // First-frame session restore — before we know signed-in vs signed-out.
  if (status === "loading") {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.teal} />
      </SafeAreaView>
    );
  }

  const busy = status === "signing-in";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={styles.fill}>
        <View style={styles.centerCol}>
          <AudricMark size={48} color={colors.fg} />
          <Text style={[styles.welcomeTitle, { color: colors.fg }]}>
            Private AI,{"\n"}truly yours
          </Text>
          <Text style={[styles.welcomeSub, { color: colors.mutedFg }]}>
            Multi-model chat with a non-custodial wallet built in. Your keys, your
            data, your call.
          </Text>
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 30 }]}>
          {busy ? (
            <View style={styles.loadingCol}>
              <ActivityIndicator size="large" color={colors.fg} />
              <Text style={[styles.loadingTitle, { color: colors.fg }]}>
                Setting up your private workspace
              </Text>
              <Text style={[styles.loadingSub, { color: colors.mutedFg }]}>
                Creating your non-custodial wallet…
              </Text>
            </View>
          ) : (
            <>
              {error ? (
                <Text style={[styles.error, { color: colors.danger }]}>
                  {error}
                </Text>
              ) : null}
              <Pressable
                onPress={signIn}
                style={({ pressed }) => [
                  styles.googleBtn,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  pressed && styles.dim,
                ]}
              >
                <GoogleG size={18} />
                <Text style={[styles.googleText, { color: colors.fg }]}>
                  Continue with Google
                </Text>
              </Pressable>
              <Text style={[styles.terms, { color: colors.mutedFg }]}>
                By continuing you agree to the{" "}
                <Text
                  style={{ color: colors.fg }}
                  onPress={() => openAudricWeb(AUDRIC_TERMS_URL)}
                >
                  Terms
                </Text>{" "}
                and{" "}
                <Text
                  style={{ color: colors.fg }}
                  onPress={() => openAudricWeb(AUDRIC_PRIVACY_URL)}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  fill: { flex: 1 },
  centerCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  welcomeTitle: {
    fontFamily: fonts.semibold,
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.98,
    textAlign: "center",
  },
  welcomeSub: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    lineHeight: 23,
    textAlign: "center",
    maxWidth: 260,
  },
  bottom: { paddingHorizontal: 24, paddingTop: 4 },
  loadingCol: { alignItems: "center", gap: 14, paddingVertical: 10 },
  loadingTitle: { fontFamily: fonts.medium, fontSize: 13.5 },
  loadingSub: { fontFamily: fonts.regular, fontSize: 12 },
  error: {
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 10,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 14,
  },
  dim: { opacity: 0.7 },
  googleText: { fontFamily: fonts.semibold, fontSize: 14 },
  terms: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16.5,
    textAlign: "center",
    maxWidth: 260,
    alignSelf: "center",
    marginTop: 14,
  },
});
