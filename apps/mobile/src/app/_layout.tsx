import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from "@expo-google-fonts/geist";
import {
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_600SemiBold,
} from "@expo-google-fonts/geist-mono";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/auth/useAuth";
import { ThemeProvider, useTheme } from "@/theme/theme";

// Expo Router SDK 57 auth pattern: a single Stack whose groups are gated by
// <Stack.Protected guard>. When `session` flips, the router auto-redirects to
// the first accessible screen — signed-in → (app), signed-out → gate.
function RootNavigator() {
  const { session, status } = useAuth();
  const { colors } = useTheme();

  // Hold on the loading state until the persisted session resolves, so the gate
  // screen never flashes before an existing session loads.
  if (status === "loading") return null;

  const signedIn = !!session;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="gate" />
      </Stack.Protected>
    </Stack>
  );
}

// StatusBar text color tracks the resolved theme (dark UI → light glyphs).
function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export default function RootLayout() {
  // Geist / Geist Mono — the web-v3 typeface. Registered under the exact family
  // names `src/theme/tokens.ts` references. Only the weights the design uses are
  // loaded (not all 18). Hold render (splash stays up) until they resolve so no
  // text flashes in the system font first.
  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_600SemiBold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStatusBar />
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
