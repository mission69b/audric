import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { providerLogoUrl } from "@/app-state/catalog";
import { useTheme } from "@/theme/theme";
import { AudricMark } from "@/components/ui/icon";

// Renders the same provider glyph the web switcher uses (models.dev SVGs). Auto
// gets the Audric mark. On any load failure, falls back to a provider-initial
// chip so a switcher row is never blank.
export function ProviderLogo({ prov, size = 22 }: { prov: string; size?: number }) {
  const { colors, isDark } = useTheme();
  const [failed, setFailed] = useState(false);
  const url = providerLogoUrl(prov);

  if (prov === "audric" || !url) {
    return <AudricMark size={size} color={colors.fg} />;
  }

  if (failed) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, backgroundColor: colors.muted },
        ]}
      >
        <Text style={[styles.fallbackText, { color: colors.fg }]}>
          {prov.charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  }

  // The models.dev marks are flat monochrome (black) glyphs — invisible on a dark
  // surface. The web switcher fixes this with `dark:invert`; RN has no cross-platform
  // invert filter, but tinting every opaque pixel white is equivalent for a flat
  // black mark (invert(#000) === #fff). Light mode keeps the original glyph.
  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: 6 }}
      contentFit="contain"
      tintColor={isDark ? "#fff" : undefined}
      transition={120}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { borderRadius: 6, alignItems: "center", justifyContent: "center" },
  fallbackText: { fontSize: 11, fontWeight: "700" },
});
