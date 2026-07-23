import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { COMING_SOON, CREDIT_USD, TOPUPS } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import { authenticate, useBiometricCapability } from "@/auth/biometrics";
import { useAuth } from "@/auth/useAuth";
import {
  AUDRIC_DEVELOPERS_URL,
  AUDRIC_PRIVACY_URL,
  AUDRIC_TERMS_URL,
  openAudricWeb,
  SUI_NETWORK,
} from "@/lib/audric-web";
import { displayHandle, expiresLabel } from "@/lib/identity";
import { CopyPill } from "@/components/ui/copy-pill";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Fingerprint,
  ScanFace,
  ShieldCheck,
  TextAlignStart,
  TriangleAlert,
  Trash2,
  Users,
  WandSparkles,
} from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

const RED = "#ef4444";
const AVATAR = ["#0ac7b4", "#0f766e", "#1e293b"] as const;

// The Settings tab (prototype SETTINGS). Two sub-views driven by the store's
// `settingsView`: home (Passport identity, Memory, General, Your Data, Privacy,
// Plan, Sign out) and billing (credit balance, stablecoin top-up, auto-recharge,
// payment methods, every-plan/coming-soon). Header title + back adapt per view.
export function SettingsScreen() {
  const { colors } = useTheme();
  const { settingsView, setTab, goSettingsHome } = useAppState();
  const isBilling = settingsView === "billing";

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable
          onPress={isBilling ? goSettingsHome : () => setTab("chat")}
          hitSlop={6}
          style={styles.back}
        >
          <ChevronLeft size={22} color={colors.fg} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.fg }]}>
          {isBilling ? "Billing" : "Settings"}
        </Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {isBilling ? <Billing /> : <SettingsHome />}
      </ScrollView>
    </View>
  );
}

// A pill toggle (Memory + Auto-recharge). 46×27 track, 21px knob, teal when on.
function Toggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.toggle,
        { backgroundColor: on ? colors.teal : colors.border, justifyContent: on ? "flex-end" : "flex-start" },
      ]}
    >
      <View style={styles.knob} />
    </Pressable>
  );
}

function SectionLabel({ children, tight }: { children: string; tight?: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionLabel, tight && styles.sectionLabelTight, { color: colors.mutedFg }]}>
      {children}
    </Text>
  );
}

function SettingsHome() {
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const {
    openHandle,
    memoryOn,
    toggleMemory,
    askConfirm,
    openReferral,
    openCustom,
    goBilling,
  } = useAppState();

  return (
    <>
      {/* PASSPORT */}
      <View>
        <SectionLabel>PASSPORT</SectionLabel>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.idRow, { borderBottomColor: colors.border }]}>
            <View style={styles.avatar} />
            <View style={styles.idMid}>
              <Text style={[styles.idName, { color: colors.fg }]}>{displayHandle(session)}</Text>
              <Text style={[styles.idSub, { color: colors.mutedFg }]}>
                Non-custodial · zkLogin wallet
              </Text>
            </View>
            <Text style={[styles.freeBadge, { color: colors.tealLabel, backgroundColor: colors.tealBg }]}>
              FREE
            </Text>
          </View>
          <Text style={[styles.passportNote, { color: colors.mutedFg, borderBottomColor: colors.border }]}>
            No seed phrase. Your wallet is created from your Google sign-in —
            non-custodial, so only you can move your money. We can't touch it.
          </Text>
          <View style={[styles.kvRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.kvKey, { color: colors.mutedFg }]}>Handle</Text>
            <Pressable onPress={openHandle} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.tealLabel }]}>Claim a handle</Text>
              <ChevronRight size={14} color={colors.tealLabel} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={[styles.kvRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.kvKey, { color: colors.mutedFg }]}>Wallet address</Text>
            <Text numberOfLines={1} style={[styles.kvVal, styles.kvMono, { color: colors.fg }]}>
              {session?.address ?? "—"}
            </Text>
            <CopyPill value={session?.address} label={false} />
          </View>
          <View style={[styles.kvRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.kvKey, { color: colors.mutedFg }]}>Network</Text>
            {/* Derived, never hardcoded: this sits beside the wallet address, so
                naming the wrong chain misstates where the user's money actually is.
                Was a literal "Sui mainnet" while the app ran on testnet. */}
            <Text style={[styles.kvVal, { color: colors.fg }]}>
              {SUI_NETWORK === "testnet" ? "Sui testnet" : "Sui mainnet"}
            </Text>
          </View>
          <View style={[styles.kvRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.kvKey, { color: colors.mutedFg }]}>Sign-in email</Text>
            <Text numberOfLines={1} style={[styles.kvVal, { color: colors.fg }]}>
              {session?.email ?? "—"}
            </Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={[styles.kvKey, { color: colors.mutedFg }]}>Session</Text>
            <Text style={[styles.kvVal, { color: colors.fg }]}>
              {expiresLabel(session) ? `Expires ${expiresLabel(session)}` : "—"}
            </Text>
          </View>
        </View>
      </View>

      {/* MEMORY */}
      <View>
        <SectionLabel>MEMORY</SectionLabel>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.memRow, { borderBottomColor: colors.border }]}>
            <ShieldCheck size={18} color={colors.mutedFg} strokeWidth={1.7} style={styles.memIcon} />
            <View style={styles.memMid}>
              <Text style={[styles.rowTitle, { color: colors.fg }]}>Private Memory</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>
                Remembers your preferences across chats so it doesn't start over —
                encrypted on Walrus (decentralized storage), off by default.
              </Text>
            </View>
            <Toggle on={memoryOn} onPress={toggleMemory} />
          </View>
          <Pressable onPress={() => askConfirm("forget")} style={styles.actionRow}>
            <Trash2 size={18} color={RED} strokeWidth={1.7} />
            <View style={styles.rowFlex}>
              <Text style={[styles.rowTitle, { color: RED }]}>Forget all my memories</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>
                Stop all recall and start fresh. Encrypted memories expire from
                storage on their own.
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* SECURITY (mobile-only: biometric app-lock — hidden if the device can't) */}
      <SecuritySection />

      {/* GENERAL */}
      <View>
        <SectionLabel>GENERAL</SectionLabel>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={openReferral} style={[styles.actionRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Users size={18} color={colors.mutedFg} strokeWidth={1.7} />
            <View style={styles.rowFlex}>
              <Text style={[styles.rowTitle, { color: colors.fg }]}>Refer &amp; earn</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>Give $10, get $10</Text>
            </View>
            <ChevronRight size={17} color={colors.mutedFg} strokeWidth={2} />
          </Pressable>
          <Pressable onPress={openCustom} style={[styles.actionRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <TextAlignStart size={18} color={colors.mutedFg} strokeWidth={1.7} />
            <View style={styles.rowFlex}>
              <Text style={[styles.rowTitle, { color: colors.fg }]}>Custom instructions</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>
                How Audric should respond to you
              </Text>
            </View>
            <ChevronRight size={17} color={colors.mutedFg} strokeWidth={2} />
          </Pressable>
          <Pressable onPress={() => openAudricWeb(AUDRIC_DEVELOPERS_URL)} style={styles.actionRow}>
            <WandSparkles size={18} color={colors.mutedFg} strokeWidth={1.7} />
            <View style={styles.rowFlex}>
              <Text style={[styles.rowTitle, { color: colors.fg }]}>Developer API</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>
                Open developer platform →
              </Text>
            </View>
            <ChevronRight size={17} color={colors.mutedFg} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* YOUR DATA */}
      <View>
        <SectionLabel>YOUR DATA</SectionLabel>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={() => askConfirm("delete")} style={[styles.actionRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Trash2 size={18} color={RED} strokeWidth={1.7} />
            <View style={styles.rowFlex}>
              <Text style={[styles.rowTitle, { color: RED }]}>Delete all chats</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>
                Permanently remove every chat and message.
              </Text>
            </View>
          </Pressable>
          <Pressable onPress={() => askConfirm("purge")} style={styles.actionRow}>
            <TriangleAlert size={18} color={RED} strokeWidth={1.7} />
            <View style={styles.rowFlex}>
              <Text style={[styles.rowTitle, { color: RED }]}>Purge all my data</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>
                Wipe every chat, message, and file. Your account, plan, and credit
                are kept.
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* PRIVACY & STORAGE */}
      <View>
        <SectionLabel>PRIVACY &amp; STORAGE</SectionLabel>
        <View style={[styles.padCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            "Zero data retention — providers never store or train on your chats.",
            "Chats and files encrypted at rest, never public — only you can read them.",
            "Memory encrypted on Walrus (decentralized) — yours, never sold.",
          ].map((t) => (
            <View key={t} style={styles.checkRow}>
              <Check size={15} color={colors.tealLabel} strokeWidth={2.2} style={styles.checkIcon} />
              <Text style={[styles.checkText, { color: colors.mutedFg }]}>{t}</Text>
            </View>
          ))}
          <View style={[styles.legalRow, { borderTopColor: colors.border }]}>
            <Pressable onPress={() => openAudricWeb(AUDRIC_PRIVACY_URL)} hitSlop={6}>
              <Text style={[styles.legalLink, { color: colors.tealLabel }]}>Privacy Policy</Text>
            </Pressable>
            <Pressable onPress={() => openAudricWeb(AUDRIC_TERMS_URL)} hitSlop={6}>
              <Text style={[styles.legalLink, { color: colors.tealLabel }]}>Terms</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* PLAN */}
      <View>
        <SectionLabel>PLAN</SectionLabel>
        <Pressable
          onPress={goBilling}
          style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <CreditCard size={18} color={colors.mutedFg} strokeWidth={1.7} />
          <View style={styles.rowFlex}>
            <View style={styles.planTitleRow}>
              <Text style={[styles.planTitle, { color: colors.fg }]}>Billing &amp; plans</Text>
              <Text style={[styles.planBadge, { color: colors.tealLabel, backgroundColor: colors.tealBg }]}>
                FREE
              </Text>
            </View>
            <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>
              Credit balance, plan &amp; subscription
            </Text>
          </View>
          <ChevronRight size={17} color={colors.mutedFg} strokeWidth={2} />
        </Pressable>
      </View>

      <Pressable
        onPress={signOut}
        style={[styles.signOut, { borderColor: colors.border }]}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </>
  );
}

// Biometric app-lock toggle (mobile-native; no web-v3 equivalent). Renders nothing
// until the device is known to support biometrics AND has one enrolled — otherwise
// there's nothing to gate the app behind. A live biometric check confirms BOTH
// directions: you can't arm a lock you can't pass, and can't disarm without passing.
function SecuritySection() {
  const { colors } = useTheme();
  const cap = useBiometricCapability();
  const { lockEnabled, setLockEnabled } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!cap?.available) return null;

  const onToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = !lockEnabled;
      const ok = await authenticate(
        next ? `Turn on ${cap.label} lock` : `Turn off ${cap.label} lock`
      );
      if (ok) await setLockEnabled(next);
    } finally {
      setBusy(false);
    }
  };

  const Icon = cap.faceId ? ScanFace : Fingerprint;

  return (
    <View>
      <SectionLabel>SECURITY</SectionLabel>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.memRow, styles.rowLast]}>
          <Icon size={18} color={colors.mutedFg} strokeWidth={1.7} style={styles.memIcon} />
          <View style={styles.memMid}>
            <Text style={[styles.rowTitle, { color: colors.fg }]}>
              Unlock with {cap.label}
            </Text>
            <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>
              Require {cap.label} to open Audric. Your session stays hidden behind
              the lock until you unlock — on this device only.
            </Text>
          </View>
          <Toggle on={lockEnabled} onPress={onToggle} />
        </View>
      </View>
    </View>
  );
}

function Billing() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const {
    billAsset,
    setBillAsset,
    termsInfoOpen,
    toggleTermsInfo,
    openPlans,
  } = useAppState();

  const termsBody =
    "Audric credit is prepaid value usable only inside Audric. All purchases are final — credit can't be refunded to your payment method, withdrawn as cash or crypto, or transferred off-platform. The free model (Kimi) stays available regardless of your credit balance.";

  return (
    <>
      {/* Balance + top-up */}
      <View style={[styles.padCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>Audric credit</Text>
        <Text style={[styles.creditNum, { color: colors.fg }]}>${CREDIT_USD}</Text>
        <Text style={[styles.tinyNote, { color: colors.mutedFg }]}>
          Spent on premium models. The free model (Kimi) is always included.
        </Text>
        <Text style={[styles.legalNote, { color: colors.mutedFg }]}>
          By topping up you agree credit is{" "}
          <Text style={{ color: colors.secondaryFg }}>non-refundable</Text>,{" "}
          <Text style={{ color: colors.secondaryFg }}>non-withdrawable</Text>, and
          spendable only on Audric.
        </Text>
        <Pressable onPress={toggleTermsInfo} style={styles.readTerms}>
          <Text style={[styles.readTermsText, { color: colors.tealLabel }]}>Read terms</Text>
          <ChevronDown
            size={11}
            color={colors.tealLabel}
            strokeWidth={2.4}
            style={termsInfoOpen ? styles.flip : undefined}
          />
        </Pressable>
        {termsInfoOpen ? (
          <Text style={[styles.termsPanel, { backgroundColor: colors.muted, color: colors.mutedFg }]}>
            {termsBody}
          </Text>
        ) : null}
      </View>

      {/* Manage plan & payment on the web. Fiat card + Stripe subscription are
          "digital goods" (IAP) to Apple/Google, so management hands off to
          audric.ai — the same platform-of-purchase model Claude/ChatGPT use.
          Crypto stablecoin top-up (below) stays native. See lib/audric-web. */}
      <Pressable
        onPress={() => openAudricWeb()}
        style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <ExternalLink size={18} color={colors.mutedFg} strokeWidth={1.7} />
        <View style={styles.rowFlex}>
          <Text style={[styles.rowTitle, { color: colors.fg }]}>Manage plan &amp; payment</Text>
          <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>
            Cards, subscription &amp; billing history on audric.ai
          </Text>
        </View>
        <ChevronRight size={17} color={colors.mutedFg} strokeWidth={2} />
      </Pressable>

      {/* Pay with stablecoin */}
      <View>
        <SectionLabel>PAY WITH STABLECOIN (SUI)</SectionLabel>
        <View style={[styles.padCard, styles.gapCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rowDesc, { color: colors.mutedFg }]}>
            Top up gaslessly from your Passport — no card. Send USDC or USDsui to
            your Passport on Sui first:
          </Text>
          <View style={[styles.addrBar, { backgroundColor: colors.muted }]}>
            <Text numberOfLines={1} style={[styles.addr, { color: colors.secondaryFg }]}>
              {session?.address ?? "—"}
            </Text>
            <CopyPill value={session?.address} size={13} />
          </View>
          <View style={[styles.assetTabs, { backgroundColor: colors.muted }]}>
            {(["USDC", "USDsui"] as const).map((a) => {
              const active = billAsset === (a === "USDsui" ? "SUI" : a);
              return (
                <Pressable
                  key={a}
                  onPress={() => setBillAsset(a === "USDsui" ? "SUI" : "USDC")}
                  style={[styles.assetTab, active && { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.assetTabText, { color: active ? colors.fg : colors.mutedFg }]}>
                    {a}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {/* Inert by design — there is no in-app purchase flow. Dimmed + captioned
              so they don't read as working buttons. */}
          <View style={styles.topupRow}>
            {TOPUPS.map((a) => (
              <View key={a} style={[styles.topupBtn, styles.topupBtnOff, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.topupTextSm, { color: colors.mutedFg }]}>+${a}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.topupNote, { color: colors.mutedFg }]}>
            Top-ups are coming soon — manage credit on the web for now.
          </Text>
        </View>
      </View>

      {/* Plans */}
      <View>
        <SectionLabel tight>PLANS</SectionLabel>
        <Text style={[styles.subLabel, { color: colors.mutedFg }]}>
          Subscribe for monthly included credit. Pay-as-you-go top-up works on any
          plan.
        </Text>
        <View style={[styles.padCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.planName, { color: colors.fg }]}>Free plan</Text>
          <Text style={[styles.rowDesc, styles.planBlurb, { color: colors.mutedFg }]}>
            Upgrade for every frontier model + monthly credit that never expires.
          </Text>
          <Pressable onPress={openPlans} style={[styles.viewPlans, { backgroundColor: colors.fg }]}>
            <Text style={[styles.viewPlansText, { color: colors.bg }]}>View plans</Text>
          </Pressable>
          <Text style={[styles.legalNote, { color: colors.mutedFg }]}>
            By subscribing you agree credit is{" "}
            <Text style={{ color: colors.secondaryFg }}>non-refundable</Text>,{" "}
            <Text style={{ color: colors.secondaryFg }}>non-withdrawable</Text>, and
            spendable only on Audric.
          </Text>
        </View>
      </View>

      {/* Coming soon */}
      <View>
        <SectionLabel>COMING SOON</SectionLabel>
        <View style={[styles.dashCard, { borderColor: colors.border }]}>
          {COMING_SOON.map((t) => (
            <View key={t} style={styles.dotRow}>
              <Text style={[styles.dot, { color: colors.mutedFg }]}>·</Text>
              <Text style={[styles.checkText, { color: colors.mutedFg }]}>{t}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  back: { padding: 3, marginLeft: -3 },
  headerTitle: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.66 },
  body: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 36, gap: 18 },

  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    letterSpacing: 0.74,
    marginHorizontal: 2,
    marginBottom: 9,
  },
  sectionLabelTight: { marginBottom: 4 },
  subLabel: { fontFamily: fonts.regular, fontSize: 11.5, marginHorizontal: 2, marginBottom: 9 },

  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: "hidden" },
  padCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14 },
  gapCard: { gap: 12 },

  // Passport
  idRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 46, height: 46, borderRadius: 14, backgroundColor: AVATAR[1] },
  idMid: { flex: 1, minWidth: 0 },
  idName: { fontFamily: fonts.semibold, fontSize: 15 },
  idSub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  freeBadge: {
    fontFamily: fonts.semibold,
    fontSize: 9.5,
    letterSpacing: 0.38,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  passportNote: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 17.8,
    padding: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  kvRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  kvKey: { fontFamily: fonts.regular, fontSize: 12.5 },
  kvVal: { flex: 1, minWidth: 0, textAlign: "right", fontFamily: fonts.medium, fontSize: 12.5 },
  kvMono: { fontFamily: fonts.monoMedium, fontSize: 12 },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  linkText: { fontFamily: fonts.semibold, fontSize: 12.5 },

  // Memory / generic rows
  memRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memIcon: { marginTop: 1 },
  memMid: { flex: 1, minWidth: 0 },
  rowLast: { borderBottomWidth: 0 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowFlex: { flex: 1 },
  rowTitle: { fontFamily: fonts.medium, fontSize: 13.5 },
  rowDesc: { fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 17, marginTop: 1 },

  // Toggle
  toggle: { width: 46, height: 27, borderRadius: 999, padding: 3, flexDirection: "row" },
  knob: {
    width: 21,
    height: 21,
    borderRadius: 999,
    backgroundColor: "#fff",
  },

  // Privacy checks
  checkRow: { flexDirection: "row", gap: 9 },
  checkIcon: { marginTop: 1 },
  checkText: { flex: 1, fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 17.3 },
  legalRow: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 9,
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legalLink: { fontFamily: fonts.medium, fontSize: 11.5 },

  // Plan card
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  planTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planTitle: { fontFamily: fonts.medium, fontSize: 13.5 },
  planBadge: {
    fontFamily: fonts.semibold,
    fontSize: 9,
    letterSpacing: 0.36,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
    overflow: "hidden",
  },
  signOut: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  signOutText: { fontFamily: fonts.medium, fontSize: 13.5, color: RED },

  // Billing
  creditNum: {
    fontFamily: fonts.monoSemibold,
    fontSize: 30,
    letterSpacing: -0.6,
    marginTop: 3,
    fontVariant: ["tabular-nums"],
  },
  tinyNote: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 16.5, marginTop: 5 },
  topupRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  topupBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: "center",
  },
  topupBtnOff: { opacity: 0.5 },
  topupNote: { fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  topupTextSm: { fontFamily: fonts.semibold, fontSize: 12.5 },
  legalNote: { fontFamily: fonts.regular, fontSize: 10.5, lineHeight: 16.3, marginTop: 11, marginHorizontal: 2 },
  readTerms: { flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 5, paddingHorizontal: 2 },
  readTermsText: { fontFamily: fonts.semibold, fontSize: 10.5 },
  flip: { transform: [{ rotate: "180deg" }] },
  termsPanel: {
    marginTop: 8,
    marginHorizontal: 2,
    padding: 11,
    paddingHorizontal: 12,
    borderRadius: 11,
    fontFamily: fonts.regular,
    fontSize: 10.5,
    lineHeight: 17.3,
  },

  addrBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  addr: { flex: 1, minWidth: 0, fontFamily: fonts.monoMedium, fontSize: 12 },
  copyText: { fontFamily: fonts.semibold, fontSize: 12 },
  assetTabs: { flexDirection: "row", borderRadius: 10, padding: 3 },
  assetTab: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  assetTabText: { fontFamily: fonts.semibold, fontSize: 12 },

  planName: { fontFamily: fonts.semibold, fontSize: 14 },
  planBlurb: { marginTop: 3, marginBottom: 12 },
  viewPlans: { borderRadius: 11, paddingVertical: 11, alignItems: "center" },
  viewPlansText: { fontFamily: fonts.semibold, fontSize: 13.5 },

  dashCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  dotRow: { flexDirection: "row", gap: 9 },
  dot: { fontFamily: fonts.regular, fontSize: 11.5 },
});
