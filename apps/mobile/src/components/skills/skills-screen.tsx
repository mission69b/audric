import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SKILLS } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import { ChevronLeft, Pencil, Sparkle } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

const FREE_GREEN = "#059669";

// The Skills tab (prototype SKILLS). A scrollable catalog of the 8 built-in,
// chat-native live-data skills (mirrors web-v3 lib/skills/catalog.ts). Each card
// lists three example prompts; tapping one drops it into the composer draft and
// returns to chat so the user can tweak before sending (prototype dropExample).
export function SkillsScreen() {
  const { colors } = useTheme();
  const { setTab, setDraft } = useAppState();

  const useExample = (text: string) => {
    setDraft(text);
    setTab("chat");
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => setTab("chat")} hitSlop={6} style={styles.back}>
          <ChevronLeft size={22} color={colors.fg} strokeWidth={2} />
        </Pressable>
        <Sparkle size={19} color={colors.fg} strokeWidth={1.9} />
        <Text style={[styles.headerTitle, { color: colors.fg }]}>Skills</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.intro, { color: colors.mutedFg }]}>
          Built-in, always-on live data — just ask in chat. No setup, free on every
          plan.
        </Text>

        {SKILLS.map((skill) => (
          <View
            key={skill.name}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.cardHead}>
              <View style={[styles.tile, { backgroundColor: colors.muted }]}>
                <Sparkle size={17} color={colors.secondaryFg} strokeWidth={1.8} />
              </View>
              <View style={styles.cardMid}>
                <Text style={[styles.name, { color: colors.fg }]}>{skill.name}</Text>
                <Text style={[styles.category, { color: colors.mutedFg }]}>{skill.category}</Text>
              </View>
              <Text style={[styles.freeBadge, { color: "#fff", backgroundColor: FREE_GREEN }]}>
                FREE
              </Text>
            </View>

            <Text style={[styles.desc, { color: colors.mutedFg }]}>{skill.description}</Text>

            <View style={styles.examples}>
              {skill.examples.map((ex) => (
                <Pressable
                  key={ex}
                  onPress={() => useExample(ex)}
                  style={[styles.example, { borderTopColor: colors.border }]}
                >
                  <Pencil size={13} color={colors.tealLabel} strokeWidth={1.8} style={styles.exIcon} />
                  <Text style={[styles.exText, { color: colors.secondaryFg }]}>{ex}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
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

  body: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 36, gap: 14 },
  intro: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18.5, marginHorizontal: 2 },

  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 15 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 11 },
  tile: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardMid: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.semibold, fontSize: 14.5 },
  category: { fontFamily: fonts.regular, fontSize: 11, marginTop: 1 },
  freeBadge: {
    fontFamily: fonts.semibold,
    fontSize: 9,
    letterSpacing: 0.36,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  desc: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18.5, marginTop: 11 },

  examples: { marginTop: 13 },
  example: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  exIcon: { marginTop: 1.5 },
  exText: { flex: 1, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17.5 },
});
