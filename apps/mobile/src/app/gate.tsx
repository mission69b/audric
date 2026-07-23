import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/useAuth";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// Ink on the solid-teal primary button — dark in both themes (teal is shared).
const ACCENT_INK = "#04141a";

// Signed-out sign-in screen: continue with Google → a non-custodial Sui wallet is
// derived on-device (no seed phrase, no passwords).
export default function GateScreen() {
  const { colors } = useTheme();
  const { status, error, signIn } = useAuth();

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
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <View style={[styles.diamond, { backgroundColor: colors.teal }]} />
          <Text style={[styles.brand, { color: colors.fg }]}>Audric</Text>
        </View>

        <Text style={[styles.h1, { color: colors.fg }]}>
          Private, decentralized AI — truly yours.
        </Text>
        <Text style={[styles.sub, { color: colors.secondaryFg }]}>
          Sign in with Google to create your non-custodial Sui wallet. No seed
          phrase, no passwords — just tap and go.
        </Text>

        {error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.teal },
            (busy || pressed) && styles.btnDim,
          ]}
          onPress={signIn}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={ACCENT_INK} />
          ) : (
            <Text style={styles.btnText}>Continue with Google</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    padding: 24,
    gap: 14,
    flexGrow: 1,
    justifyContent: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  diamond: {
    width: 18,
    height: 18,
    transform: [{ rotate: "45deg" }],
    borderRadius: 3,
  },
  brand: {
    fontFamily: fonts.semibold,
    fontSize: 20,
    letterSpacing: 0.3,
  },
  h1: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
    marginTop: 14,
  },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  error: { fontFamily: fonts.regular, fontSize: 13 },
  btn: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 10,
  },
  btnDim: { opacity: 0.7 },
  btnText: {
    color: ACCENT_INK,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
});
