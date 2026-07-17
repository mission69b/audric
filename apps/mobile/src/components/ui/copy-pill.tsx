import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Check, Copy } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/tokens";

// Shared copy-to-clipboard affordance. Writes `value` to the clipboard and flips
// to a "Copied" checkmark for ~1.4s. Disabled (and inert) when `value` is empty so
// a not-yet-loaded address can't copy a blank string. Used anywhere the app shows a
// wallet address / link the user is expected to copy.
export function CopyPill({
  value,
  size = 14,
  label = true,
}: {
  value?: string | null;
  size?: number;
  label?: boolean;
}) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <Pressable onPress={onCopy} disabled={!value} hitSlop={6} style={styles.btn}>
      {copied ? (
        <Check size={size} color={colors.tealLabel} strokeWidth={2.2} />
      ) : (
        <Copy size={size} color={colors.tealLabel} strokeWidth={1.9} />
      )}
      {label ? (
        <Text style={[styles.text, { color: colors.tealLabel }]}>
          {copied ? "Copied" : "Copy"}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", gap: 5 },
  text: { fontFamily: fonts.semibold, fontSize: 12 },
});
