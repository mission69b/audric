import { LinearGradient } from "expo-linear-gradient";
import type { StyleProp, ViewStyle } from "react-native";

// The Passport avatar (prototype `linear-gradient(140deg, …)`). One definition,
// used everywhere the signed-in identity is shown: Settings → Passport, the
// drawer footer, and the account menu. It was previously three separate copies —
// the account menu drew the real three-stop gradient while Settings and the
// drawer hardcoded the middle stop (`#0f766e`) as a flat fill, so the same user
// appeared as a dull green block in two places and a teal gradient in the third.
const STOPS = ["#0ac7b4", "#0f766e", "#1e293b"] as const;

export function PassportAvatar({
  size,
  radius,
  style,
}: {
  size: number;
  /** corner radius; omit for a circle. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      colors={STOPS}
      locations={[0, 0.55, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        { width: size, height: size, borderRadius: radius ?? 999 },
        style,
      ]}
    />
  );
}
