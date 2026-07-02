// Sheet + dialog primitives. The prototype presents every non-tab surface as a
// bottom sheet (a slide-up panel over a scrim) or a centered dialog (confirm /
// nudge). These wrap RN's <Modal> so on a real device they float above the whole
// app, and animate IN over ~220ms (fade + slide) but close instantly — matching
// the prototype's `fadeup` transition and immediate dismiss.

import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "@/components/ui/icon";
import { useTheme } from "@/theme/theme";
import { fonts, radius, space } from "@/theme/tokens";

// A slide-up bottom sheet. `visible` toggles the whole modal; on show it animates
// the panel up from offscreen and fades the scrim in. Tapping the scrim closes.
export function BottomSheet({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.9,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** cap the panel height as a fraction of screen height (default 90%) */
  maxHeightRatio?: number;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const slide = useRef(new Animated.Value(1)).current; // 1 = offscreen, 0 = seated
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    slide.setValue(1);
    fade.setValue(0);
    Animated.parallel([
      Animated.timing(slide, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [visible, slide, fade]);

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, height],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.bottomRoot}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: fade }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.panel,
            {
              backgroundColor: colors.sheet,
              paddingBottom: insets.bottom + space.sm,
              maxHeight: height * maxHeightRatio,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// A centered dialog (destructive confirms, the sign-in nudge). Fades + scales in;
// closes instantly. Tapping the scrim closes unless `dismissable` is false.
export function CenterDialog({
  visible,
  onClose,
  children,
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  dismissable?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (!visible) return;
    fade.setValue(0);
    scale.setValue(0.96);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, fade, scale]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        style={[styles.centerRoot, { backgroundColor: colors.scrim, opacity: fade }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissable ? onClose : undefined}
        />
        <Animated.View
          style={[
            styles.dialog,
            {
              backgroundColor: colors.sheet,
              borderColor: colors.border,
              marginBottom: insets.bottom,
              opacity: fade,
              transform: [{ scale }],
            },
          ]}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// Sheet title row: heading on the left, optional close button on the right.
export function SheetHeader({
  title,
  onClose,
  right,
}: {
  title: string;
  onClose?: () => void;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.fg }]}>{title}</Text>
      <View style={styles.headerRight}>
        {right}
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
          >
            <X size={14} color={colors.mutedFg} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomRoot: { flex: 1, justifyContent: "flex-end" },
  panel: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    marginBottom: space.md,
  },
  centerRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: space.sm },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
