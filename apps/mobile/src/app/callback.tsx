import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/useAuth";
import { useTheme } from "@/theme/theme";

// Landing route for the `audric://callback` deep link (APP_RETURN_URI in
// `auth/config.ts`) — the custom scheme the sign-in bridge 302s the auth code to.
// Without a route here, Expo Router fell through to its "Unmatched Route" screen,
// which flashed an error-looking page mid-sign-in on the path every user walks.
//
// It does NO auth work: `expo-auth-session` resolves the redirect inside the
// already-open `authorizeWithGoogle()` promise and `useAuth().signIn` drives the
// exchange from there. This screen only has to show something calm and then GET OUT
// OF THE WAY.
//
// Getting out of the way is the whole subtlety. `RootNavigator` routes between
// `(app)` and `gate` with `Stack.Protected` guards; `callback` is in neither group,
// so once the router lands here nothing moves it along — a bare spinner screen
// strands the user mid-sign-in. Hence the explicit redirect the moment the exchange
// settles: `/` re-enters the guarded stack, which picks `(app)` or `gate` from the
// session that sign-in just wrote.
export default function CallbackScreen() {
  const { colors } = useTheme();
  const { status } = useAuth();

  // Still resolving — hold the spinner rather than bouncing to the gate and back.
  if (status === "signing-in" || status === "loading") {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.teal} />
      </SafeAreaView>
    );
  }

  // Settled (signed-in, or signed-out after a failure/cancel) — hand back to the
  // guarded stack, which renders the right destination for that state.
  return <Redirect href="/" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
