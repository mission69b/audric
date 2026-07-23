import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { fonts } from "@/theme/tokens";

// Shimmering "Thinking…" label — the native port of web-v3's
// `components/ai-elements/shimmer.tsx` (used at `components/chat/message.tsx:688`
// and `ai-elements/reasoning.tsx:159` as `<Shimmer duration={1}>Thinking...</Shimmer>`).
//
// Web does it with `bg-clip-text`: the text is transparent, painted by a solid
// muted-foreground layer plus a 90° gradient band of the *page background* colour
// that sweeps across, so glyphs fade toward the background as the band passes and
// come back after it. React Native has no background-clip, and the mask approach
// needs `@react-native-masked-view/masked-view` — a native module, i.e. a
// dev-client rebuild. Same visual, no new native dep: render one <Animated.Text>
// per character and sweep an opacity trough across them.
//
// One shared driver value, all interpolation on the native thread — no re-render
// per frame, no JS work while it runs.

/** How dim a glyph gets at the centre of the band (web fades to the page bg). */
const DIP = 0.18;
/** Half-width of the band, in fractions of the string. Web: `spread * len` px. */
const HALF = 0.28;

export function ShimmerText({
  text,
  color,
  size = 12.5,
  duration = 1000,
  style,
}: {
  text: string;
  color: string;
  size?: number;
  /** ms for one sweep. web-v3 passes `duration={1}` (seconds). */
  duration?: number;
  style?: object;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const anim = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [progress, duration]);

  // The band centre travels from -HALF to 1+HALF over one loop, so the sweep
  // enters and leaves cleanly instead of popping in at the first glyph.
  const chars = useMemo(() => Array.from(text), [text]);
  const span = 1 + 2 * HALF;
  const halfP = HALF / span;

  return (
    <View style={[styles.row, style]}>
      {chars.map((ch, i) => {
        // Where in the loop this glyph sits at the band's centre.
        const at = (i / Math.max(1, chars.length - 1) + HALF) / span;
        const opacity = progress.interpolate({
          inputRange: [at - halfP, at, at + halfP],
          outputRange: [1, DIP, 1],
          extrapolate: "clamp",
        });
        return (
          <Animated.Text
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length label, index IS the identity
            key={i}
            style={[styles.ch, { color, fontSize: size, opacity }]}
          >
            {ch}
          </Animated.Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  ch: { fontFamily: fonts.medium },
});
