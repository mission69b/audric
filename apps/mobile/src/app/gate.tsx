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
import { colors, font, radius, space } from "@/theme/tokens";

// Signed-out screen. Real path: sign in with Google, derive the Sui address
// natively, prove it matches the web app (Phase 0 gate). A __DEV__-only "Skip
// to app" button enters the app on a placeholder session so screens behind the
// gate can be built while production address-parity is still pending.
export default function GateScreen() {
  const { status, session, lastDerived, error, signIn, signOut, devBypass } =
    useAuth();

  const shortAddr = useMemo(() => {
    const a = session?.address;
    return a ? `${a.slice(0, 10)}…${a.slice(-8)}` : "";
  }, [session?.address]);

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const busy = status === "signing-in";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <View style={styles.diamond} />
          <Text style={styles.brand}>Audric</Text>
        </View>

        <Text style={styles.h1}>Private, decentralized AI — truly yours.</Text>
        <Text style={styles.sub}>
          Sign in with Google to create your non-custodial Sui wallet. No seed
          phrase. Phase 0 verifies your wallet address matches the web app
          exactly before any further build.
        </Text>

        {session ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>YOUR SUI ADDRESS</Text>
            <Text style={styles.address} selectable>
              {session.address}
            </Text>
            <Text style={styles.addrShort}>{shortAddr}</Text>
            {session.email ? (
              <Text style={styles.meta}>{session.email}</Text>
            ) : null}
            {lastDerived ? (
              <Text
                style={[
                  styles.gate,
                  {
                    color: lastDerived.audMatch
                      ? colors.success
                      : colors.danger,
                  },
                ]}
              >
                {lastDerived.audMatch
                  ? "✓ aud matches the web client (no wallet fork)"
                  : "✗ aud MISMATCH — wallet would fork. STOP."}
              </Text>
            ) : null}
            <Text style={styles.gateHint}>
              Open the live web app with the same Google account and confirm the
              address is identical. Match = Phase 0 PASS.
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            (busy || pressed) && styles.btnDim,
          ]}
          onPress={signIn}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.accentInk} />
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
            <Text style={styles.btnGhostText}>Sign out</Text>
          </Pressable>
        ) : null}

        {__DEV__ && !session ? (
          <Pressable
            style={({ pressed }) => [styles.btnDev, pressed && styles.btnDim]}
            onPress={devBypass}
            disabled={busy}
          >
            <Text style={styles.btnDevText}>Skip to app (dev) →</Text>
          </Pressable>
        ) : null}

        <Text style={styles.footnote}>
          Phase 0 gate · address parity must hold before any wallet code ships.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    padding: space.lg,
    gap: space.md,
    flexGrow: 1,
    justifyContent: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  diamond: {
    width: 18,
    height: 18,
    backgroundColor: colors.accent,
    transform: [{ rotate: "45deg" }],
    borderRadius: 3,
  },
  brand: {
    color: colors.foreground,
    fontSize: font.heading,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  h1: {
    color: colors.foreground,
    fontSize: font.title,
    fontWeight: "700",
    lineHeight: 34,
    marginTop: space.md,
  },
  sub: { color: colors.muted, fontSize: font.body, lineHeight: 22 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
    marginTop: space.sm,
  },
  cardLabel: {
    color: colors.mutedFaint,
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "600",
  },
  address: {
    color: colors.foreground,
    fontSize: 14,
    fontFamily: "monospace",
  },
  addrShort: { color: colors.muted, fontSize: font.small },
  meta: { color: colors.muted, fontSize: font.small },
  gate: { fontSize: font.small, fontWeight: "600", marginTop: space.xs },
  gateHint: { color: colors.mutedFaint, fontSize: font.small, lineHeight: 18 },
  error: { color: colors.danger, fontSize: font.small },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: space.sm,
  },
  btnDim: { opacity: 0.7 },
  btnText: { color: colors.accentInk, fontSize: font.body, fontWeight: "700" },
  btnGhost: { paddingVertical: 14, alignItems: "center" },
  btnGhostText: { color: colors.muted, fontSize: font.body, fontWeight: "500" },
  btnDev: {
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: space.xs,
  },
  btnDevText: { color: colors.mutedFaint, fontSize: font.small, fontWeight: "600" },
  footnote: {
    color: colors.mutedFaint,
    fontSize: 12,
    textAlign: "center",
    marginTop: space.md,
  },
});
