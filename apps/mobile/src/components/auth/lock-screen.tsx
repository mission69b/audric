import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/useAuth";
import { ScanFace } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// Full-screen lock shown over the app when a session exists but the biometric
// lock is armed (see useAuth `locked`). Auto-prompts the OS sheet on mount; a
// failed/cancelled attempt leaves a "Unlock" button to retry, plus a way out
// (sign out) so a user who can't pass biometrics is never trapped.
export function LockScreen() {
  const { colors } = useTheme();
  const { unlock, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const attempt = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const ok = await unlock();
    setBusy(false);
    if (!ok) setFailed(true);
  }, [unlock]);

  // Prompt once as soon as the lock appears.
  useEffect(() => {
    attempt();
  }, [attempt]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={styles.safe}>
        <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
          <ScanFace size={30} color={colors.tealLabel} strokeWidth={1.7} />
        </View>
        <Text style={[styles.title, { color: colors.fg }]}>Audric is locked</Text>
        <Text style={[styles.sub, { color: colors.mutedFg }]}>
          {failed
            ? "Authentication is needed to continue."
            : "Unlock to continue."}
        </Text>

        <Pressable
          onPress={attempt}
          disabled={busy}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.tealLabel },
            (busy || pressed) && styles.dim,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Unlock</Text>
          )}
        </Pressable>

        <Pressable onPress={signOut} hitSlop={8} style={styles.signout}>
          <Text style={[styles.signoutText, { color: colors.mutedFg }]}>
            Sign out
          </Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  icon: {
    width: 68,
    height: 68,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  title: { fontFamily: fonts.semibold, fontSize: 19, letterSpacing: -0.3 },
  sub: { fontFamily: fonts.regular, fontSize: 14, textAlign: "center" },
  btn: {
    marginTop: 14,
    minWidth: 200,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  dim: { opacity: 0.7 },
  btnText: { color: "#fff", fontFamily: fonts.semibold, fontSize: 15 },
  signout: { marginTop: 4, paddingVertical: 10 },
  signoutText: { fontFamily: fonts.medium, fontSize: 14 },
});
