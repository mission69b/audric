import { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MODELS, type ModelRow } from "@/app-state/catalog";
import { useAppState } from "@/app-state/store";
import { ProviderLogo } from "@/components/chat/provider-logo";
import { BottomSheet, SheetHeader } from "@/components/ui/sheet";
import { Brain, Check, Eye, Lock, Sparkle, Wrench } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// The "Choose model" bottom sheet (prototype MODEL SHEET). Mirrors web-v3's model
// switcher: search box, one "Models" group, a row per model with provider glyph +
// capability icons + best-for subtitle + price/Free/DEFAULT + the always-on
// "Private" (ZDR) badge, a lock on premium (Free persona → premium gated) and a
// check on the selected one. Selecting a locked model opens Plans; else it picks.
export function ModelSheet() {
  const { colors } = useTheme();
  const {
    modelSheet,
    closeModel,
    modelQuery,
    setModelQuery,
    model,
    pickModel,
    openPlans,
  } = useAppState();

  const q = modelQuery.trim().toLowerCase();
  const items = useMemo(
    () =>
      MODELS.filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.best.toLowerCase().includes(q)
      ),
    [q]
  );

  return (
    <BottomSheet visible={modelSheet} onClose={closeModel} maxHeightRatio={0.82}>
      <SheetHeader title="Choose model" onClose={closeModel} />

      <TextInput
        value={modelQuery}
        onChangeText={setModelQuery}
        placeholder="Search models…"
        placeholderTextColor={colors.mutedFg}
        style={[
          styles.search,
          { backgroundColor: colors.muted, borderColor: colors.border, color: colors.fg },
        ]}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.group, { color: colors.mutedFg }]}>Models</Text>
        {items.map((m) => (
          <ModelRowItem
            key={m.name}
            row={m}
            selected={m.name === model}
            onSelect={() =>
              m.kind === "paid"
                ? (closeModel(), openPlans())
                : pickModel(m.name)
            }
          />
        ))}

        <View style={[styles.footer, { backgroundColor: colors.muted }]}>
          <View style={styles.footRow}>
            <Text style={[styles.footAnon, { color: colors.mutedFg }]}>Anon</Text>
            <Text style={[styles.footArrow, { color: colors.mutedFg }]}>→</Text>
            <Text
              style={[
                styles.footPriv,
                { color: colors.tealLabel, backgroundColor: colors.tealBg },
              ]}
            >
              Private · ZDR
            </Text>
          </View>
          <Text style={[styles.footNote, { color: colors.mutedFg }]}>
            Every chat is zero-retention — your prompts are never stored or trained on.
          </Text>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function ModelRowItem({
  row,
  selected,
  onSelect,
}: {
  row: ModelRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const isAuto = row.kind === "auto";
  const isPaid = row.kind === "paid";

  return (
    <Pressable
      onPress={onSelect}
      style={[
        styles.row,
        { backgroundColor: selected ? colors.secondary : "transparent" },
      ]}
    >
      <View style={[styles.tile, { backgroundColor: colors.muted }]}>
        {row.prov === "audric" ? (
          <Sparkle size={16} color={colors.fg} strokeWidth={1.8} />
        ) : (
          <ProviderLogo prov={row.prov} size={17} />
        )}
      </View>

      <View style={styles.mid}>
        <View style={styles.nameRow}>
          <Text
            numberOfLines={1}
            style={[styles.name, { color: colors.fg }]}
          >
            {row.name}
          </Text>
          <View style={styles.caps}>
            {row.caps.vision ? <Eye size={11} color={colors.mutedFg} strokeWidth={2} /> : null}
            {row.caps.tools ? <Wrench size={11} color={colors.mutedFg} strokeWidth={2} /> : null}
            {row.caps.reasoning ? <Brain size={11} color={colors.mutedFg} strokeWidth={2} /> : null}
          </View>
        </View>
        <Text numberOfLines={1} style={[styles.best, { color: colors.mutedFg }]}>
          {row.best}
        </Text>
      </View>

      <View style={styles.right}>
        {row.kind === "free" ? <Text style={styles.free}>Free</Text> : null}
        {isAuto ? (
          <Text style={[styles.badge, { color: colors.mutedFg, backgroundColor: colors.muted }]}>
            DEFAULT
          </Text>
        ) : null}
        {isPaid ? (
          <Text style={[styles.price, { color: colors.fg }]}>{`$${row.price}/1M`}</Text>
        ) : null}
        <Text
          style={[styles.privacy, { color: colors.tealLabel, backgroundColor: colors.tealBg }]}
        >
          Private
        </Text>
      </View>

      {isPaid ? <Lock size={14} color={colors.mutedFg} strokeWidth={2} /> : null}
      {selected ? <Check size={17} color={colors.tealLabel} strokeWidth={2.4} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 13,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginBottom: 8,
  },
  scroll: { flexShrink: 1 },
  scrollBody: { paddingBottom: 20 },
  group: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    letterSpacing: 0.63,
    paddingTop: 12,
    paddingBottom: 5,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  tile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  mid: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontFamily: fonts.medium, fontSize: 13.5, flexShrink: 1 },
  caps: { flexDirection: "row", alignItems: "center", gap: 4 },
  best: { fontFamily: fonts.regular, fontSize: 11.5, marginTop: 1 },
  right: { alignItems: "flex-end", gap: 3 },
  free: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: "#10b981",
  },
  badge: {
    fontFamily: fonts.semibold,
    fontSize: 8.5,
    letterSpacing: 0.42,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
    overflow: "hidden",
  },
  price: { fontFamily: fonts.monoMedium, fontSize: 10 },
  privacy: {
    fontFamily: fonts.semibold,
    fontSize: 8.5,
    letterSpacing: 0.26,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  footer: {
    marginTop: 10,
    marginHorizontal: 8,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 11,
  },
  footRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  footAnon: { fontFamily: fonts.regular, fontSize: 10, opacity: 0.6 },
  footArrow: { fontFamily: fonts.regular, fontSize: 10, opacity: 0.45 },
  footPriv: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  footNote: {
    fontFamily: fonts.regular,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 5,
  },
});
