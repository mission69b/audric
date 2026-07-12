import { useMemo } from "react";
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

// Signed-out screen. Real path: sign in with Google, derive the Sui address
// natively, prove it matches the web app (Phase 0 gate). A __DEV__-only "Skip
// to app" button enters the app on a placeholder session so screens behind the
// gate can be built while production address-parity is still pending.
// Themed via useTheme (light/dark) like the rest of the app — no more
// hard-dark seam against the onboarding flow.
export default function GateScreen() {
  const { colors } = useTheme();
  const { status, session, lastDerived, error, signIn, signOut, devBypass } =
    useAuth();

  const shortAddr = useMemo(() => {
    const a = session?.address;
    return a ? `${a.slice(0, 10)}…${a.slice(-8)}` : "";
  }, [session?.address]);

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
          phrase. Phase 0 verifies your wallet address matches the web app
          exactly before any further build.
        </Text>

        {session ? (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.cardLabel, { color: colors.mutedFg }]}>
              YOUR SUI ADDRESS
            </Text>
            <Text style={[styles.address, { color: colors.fg }]} selectable>
              {session.address}
            </Text>
            <Text style={[styles.addrShort, { color: colors.secondaryFg }]}>
              {shortAddr}
            </Text>
            {session.email ? (
              <Text style={[styles.meta, { color: colors.secondaryFg }]}>
                {session.email}
              </Text>
            ) : null}
            {lastDerived ? (
              <Text
                style={[
                  styles.gate,
                  {
                    color: lastDerived.audMatch ? colors.priv : colors.danger,
                  },
                ]}
              >
                {lastDerived.audMatch
                  ? "✓ aud matches the web client (no wallet fork)"
                  : "✗ aud MISMATCH — wallet would fork. STOP."}
              </Text>
            ) : null}
            <Text style={[styles.gateHint, { color: colors.mutedFg }]}>
              Open the live web app with the same Google account and confirm the
              address is identical. Match = Phase 0 PASS.
            </Text>
          </View>
        ) : null}

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
            <Text style={styles.btnText}>
              {session
                ? "Sign in again (re-check parity)"
                : "Continue with Google"}
            </Text>
          )}
        </Pressable>

        {session ? (
          <Pressable
            style={({ pressed }) => [styles.btnGhost, pressed && styles.btnDim]}
            onPress={signOut}
            disabled={busy}
          >
            <Text style={[styles.btnGhostText, { color: colors.secondaryFg }]}>
              Sign out
            </Text>
          </Pressable>
        ) : null}

        {__DEV__ && !session ? (
          <Pressable
            style={({ pressed }) => [
              styles.btnDev,
              { borderColor: colors.border },
              pressed && styles.btnDim,
            ]}
            onPress={devBypass}
            disabled={busy}
          >
            <Text style={[styles.btnDevText, { color: colors.mutedFg }]}>
              Skip to app (dev) →
            </Text>
          </Pressable>
        ) : null}

        <Text style={[styles.footnote, { color: colors.mutedFg }]}>
          Phase 0 gate · address parity must hold before any wallet code ships.
        </Text>
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
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    gap: 10,
    marginTop: 10,
  },
  cardLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 1,
  },
  address: {
    fontSize: 14,
    fontFamily: fonts.monoMedium,
  },
  addrShort: { fontFamily: fonts.regular, fontSize: 13 },
  meta: { fontFamily: fonts.regular, fontSize: 13 },
  gate: { fontFamily: fonts.semibold, fontSize: 13, marginTop: 6 },
  gateHint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
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
  btnGhost: { paddingVertical: 14, alignItems: "center" },
  btnGhostText: { fontFamily: fonts.medium, fontSize: 15 },
  btnDev: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 6,
  },
  btnDevText: { fontFamily: fonts.semibold, fontSize: 13 },
  footnote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    textAlign: "center",
    marginTop: 14,
  },
});
