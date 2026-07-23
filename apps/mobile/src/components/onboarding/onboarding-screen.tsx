import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "@/app-state/store";
import { authenticate, useBiometricCapability } from "@/auth/biometrics";
import { useAuth } from "@/auth/useAuth";
import { useBalance } from "@/lib/wallet-data";
import { CopyPill } from "@/components/ui/copy-pill";
import { AUDRIC_PRIVACY_URL, AUDRIC_TERMS_URL, openAudricWeb } from "@/lib/audric-web";
import {
  AudricMark,
  EyeOff,
  Lock,
  ScanFace,
  ShieldCheck,
  Unplug,
  Wallet,
} from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// The first-launch onboarding (prototype OnboardScreen). Four steps — Welcome →
// Privacy → Wallet ready → Face ID — with a progress-dot header. It renders
// AFTER the real sign-in gate (src/app/gate.tsx), so the user already holds a
// session: step 0 just advances (the prototype's mock "Continue with Google"
// re-ask was removed — sign-in happens exactly once, at the gate). It renders
// full screen in place of the tab shell until `onboarded` flips true.
export function OnboardingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { step } = useAppState();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                width: i === step ? 20 : 6,
                backgroundColor: i <= step ? colors.fg : colors.border,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.stage}>
        {step === 0 ? (
          <Welcome />
        ) : step === 1 ? (
          <Privacy />
        ) : step === 2 ? (
          <WalletReady />
        ) : (
          <FaceId />
        )}
      </View>
    </View>
  );
}

function Welcome() {
  const { colors } = useTheme();
  const { onboardNext, finishOnboarding } = useAppState();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.fill}>
      <View style={styles.centerCol}>
        <AudricMark size={48} color={colors.fg} />
        <Text style={[styles.welcomeTitle, { color: colors.fg }]}>Private AI,{"\n"}truly yours</Text>
        <Text style={[styles.welcomeSub, { color: colors.mutedFg }]}>
          Multi-model chat with a non-custodial wallet built in. Your keys, your
          data, your call.
        </Text>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 30 }]}>
        <Pressable onPress={onboardNext} style={[styles.primaryBtn, { backgroundColor: colors.fg }]}>
          <Text style={[styles.primaryText, { color: colors.bg }]}>Get started</Text>
        </Pressable>
        <Text style={[styles.terms, { color: colors.mutedFg }]}>
          By continuing you agree to the{" "}
          <Text style={{ color: colors.fg }} onPress={() => openAudricWeb(AUDRIC_TERMS_URL)}>
            Terms
          </Text>{" "}
          and{" "}
          <Text style={{ color: colors.fg }} onPress={() => openAudricWeb(AUDRIC_PRIVACY_URL)}>
            Privacy Policy
          </Text>
          .
        </Text>
        <Pressable onPress={finishOnboarding} hitSlop={6} style={styles.skip}>
          <Text style={[styles.skipText, { color: colors.mutedFg }]}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const PRIVACY_ROWS = [
  {
    Icon: EyeOff,
    title: "Zero data retention",
    desc: "Your chats aren't stored or used to train models.",
  },
  {
    Icon: Lock,
    title: "Private memory, off by default",
    desc: "Turn it on and it's encrypted, decentralized, and yours to delete.",
  },
  {
    Icon: Unplug,
    title: "Non-custodial wallet",
    desc: "Only you hold the keys. We never can.",
  },
];

function Privacy() {
  const { colors } = useTheme();
  const { onboardNext } = useAppState();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.fill}>
      <View style={styles.privBody}>
        <View style={[styles.privTile, { backgroundColor: colors.privBg }]}>
          <ShieldCheck size={26} color={colors.priv} strokeWidth={1.9} />
        </View>
        <Text style={[styles.stepTitle, { color: colors.fg }]}>Private by default</Text>
        <Text style={[styles.privLead, { color: colors.mutedFg }]}>
          Three things that are true the moment you start.
        </Text>
        <View style={styles.privRows}>
          {PRIVACY_ROWS.map(({ Icon, title, desc }) => (
            <View key={title} style={styles.privRow}>
              <View style={[styles.privRowTile, { backgroundColor: colors.muted }]}>
                <Icon size={17} color={colors.secondaryFg} strokeWidth={1.8} />
              </View>
              <View style={styles.flex1}>
                <Text style={[styles.privRowTitle, { color: colors.fg }]}>{title}</Text>
                <Text style={[styles.privRowDesc, { color: colors.mutedFg }]}>{desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 30 }]}>
        <Pressable onPress={onboardNext} style={[styles.primaryBtn, { backgroundColor: colors.fg }]}>
          <Text style={[styles.primaryText, { color: colors.bg }]}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

function WalletReady() {
  const { colors } = useTheme();
  const { openReceive, onboardNext } = useAppState();
  const { session } = useAuth();
  const { usdc } = useBalance();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.fill}>
      <View style={styles.centerCol}>
        <View style={[styles.walletTile, { backgroundColor: colors.tealBg }]}>
          <Wallet size={26} color={colors.tealLabel} strokeWidth={1.9} />
        </View>
        <Text style={[styles.stepTitle, styles.center, { color: colors.fg }]}>Your wallet is ready</Text>
        <Text style={[styles.stepSub, { color: colors.mutedFg }]}>
          Created from your Google sign-in (zkLogin) — no seed phrase to write down
          or lose.
        </Text>
        <View style={[styles.balCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.balRow}>
            <View style={styles.balLeft}>
              <Text style={[styles.spendable, { color: colors.tealLabel, backgroundColor: colors.tealBg }]}>
                spendable
              </Text>
              <Text style={[styles.balAsset, { color: colors.fg }]}>USDC</Text>
            </View>
            {/* Live read, not a hardcoded "0.00": this card looks identical to the
                real wallet screen, so it must not assert a figure it did not fetch.
                "—" while loading or on a soft-fail, exactly like the wallet tab. */}
            <Text style={[styles.balNum, { color: colors.fg }]}>
              {usdc != null ? usdc.toFixed(2) : "—"}
            </Text>
          </View>
          <View style={[styles.addrRow, { borderTopColor: colors.border }]}>
            <Wallet size={14} color={colors.mutedFg} strokeWidth={1.8} />
            <Text numberOfLines={1} style={[styles.addr, { color: colors.mutedFg }]}>
              {session?.address ?? "—"}
            </Text>
            <CopyPill value={session?.address} size={13} />
          </View>
        </View>
      </View>
      <View style={[styles.bottom, styles.bottomGap, { paddingBottom: insets.bottom + 30 }]}>
        <Pressable onPress={openReceive} style={[styles.primaryBtn, { backgroundColor: colors.fg }]}>
          <Text style={[styles.primaryText, { color: colors.bg }]}>Receive</Text>
        </Pressable>
        <Pressable onPress={onboardNext} style={styles.ghostBtn}>
          <Text style={[styles.ghostText, { color: colors.mutedFg }]}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FaceId() {
  const { colors } = useTheme();
  const { finishOnboarding } = useAppState();
  const { setLockEnabled } = useAuth();
  const cap = useBiometricCapability();
  const insets = useSafeAreaInsets();

  // Actually arm the biometric app-lock: confirm with a live biometric prompt (so
  // we never enable a lock the user can't pass), persist the pref, then finish. If
  // the device has no enrolled biometrics, or the prompt is cancelled, we still
  // finish onboarding — the user is never trapped on this step.
  const onEnable = async () => {
    if (cap?.available) {
      const ok = await authenticate(`Turn on ${cap.label} lock`);
      if (ok) await setLockEnabled(true);
    }
    finishOnboarding();
  };

  return (
    <View style={styles.fill}>
      <View style={styles.centerCol}>
        <View style={[styles.faceTile, { backgroundColor: colors.secondary }]}>
          <ScanFace size={40} color={colors.fg} strokeWidth={1.7} />
        </View>
        <Text style={[styles.stepTitle, styles.center, { color: colors.fg }]}>Unlock with Face ID</Text>
        <Text style={[styles.stepSub, { color: colors.mutedFg }]}>
          Approve payments and open Audric with a glance. You can change this
          anytime in Settings.
        </Text>
      </View>
      <View style={[styles.bottom, styles.bottomGap, { paddingBottom: insets.bottom + 30 }]}>
        <Pressable onPress={onEnable} style={[styles.primaryBtn, { backgroundColor: colors.fg }]}>
          <Text style={[styles.primaryText, { color: colors.bg }]}>Enable Face ID</Text>
        </Pressable>
        <Pressable onPress={finishOnboarding} style={styles.ghostBtn}>
          <Text style={[styles.ghostText, { color: colors.mutedFg }]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingTop: 6 },
  dot: { height: 4, borderRadius: 999 },
  stage: { flex: 1, position: "relative" },

  fill: { flex: 1 },
  flex1: { flex: 1 },
  center: { textAlign: "center" },
  centerCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  bottom: { paddingHorizontal: 24, paddingTop: 4 },
  bottomGap: { gap: 10 },

  // Welcome
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
  terms: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16.5,
    textAlign: "center",
    maxWidth: 260,
    alignSelf: "center",
    marginTop: 14,
  },
  skip: { alignSelf: "center", paddingVertical: 6, marginTop: 6 },
  skipText: { fontFamily: fonts.medium, fontSize: 13 },

  // shared step heads
  stepTitle: { fontFamily: fonts.semibold, fontSize: 25, letterSpacing: -0.75 },
  stepSub: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 270,
  },

  // Privacy
  privBody: { flex: 1, justifyContent: "center", paddingHorizontal: 32, gap: 9 },
  privTile: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  privLead: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 21, marginBottom: 8 },
  privRows: { gap: 13 },
  privRow: { flexDirection: "row", gap: 13, alignItems: "flex-start" },
  privRowTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  privRowTitle: { fontFamily: fonts.semibold, fontSize: 13.5 },
  privRowDesc: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18.75, marginTop: 1 },

  // Wallet ready
  walletTile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  balCard: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
  },
  balRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  balLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  spendable: {
    fontFamily: fonts.semibold,
    fontSize: 9.5,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  balAsset: { fontFamily: fonts.regular, fontSize: 13 },
  balNum: { fontFamily: fonts.monoSemibold, fontSize: 20, fontVariant: ["tabular-nums"] },
  addrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addr: { flex: 1, minWidth: 0, fontFamily: fonts.monoMedium, fontSize: 12 },
  copy: { fontFamily: fonts.semibold, fontSize: 11 },

  // Face ID
  faceTile: {
    width: 74,
    height: 74,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  // buttons
  primaryBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  primaryText: { fontFamily: fonts.semibold, fontSize: 14 },
  ghostBtn: { paddingVertical: 11, alignItems: "center" },
  ghostText: { fontFamily: fonts.semibold, fontSize: 13.5 },
});
