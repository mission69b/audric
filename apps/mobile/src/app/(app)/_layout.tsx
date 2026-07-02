import { Stack } from "expo-router";
import { AppStateProvider } from "@/app-state/store";
import { useTheme } from "@/theme/theme";

// Authed app group. The prototype runs the whole app from ONE stateful shell:
// a `tab` swaps the content area (chat / wallet / settings / skills) in place, a
// drawer slides over it, and every other surface is a sheet. So `index` renders
// that entire shell — there are no per-screen router pushes. AppStateProvider
// holds the prototype's state machine for the whole authed session.
export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <AppStateProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
    </AppStateProvider>
  );
}
