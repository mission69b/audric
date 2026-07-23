import * as SecureStore from "expo-secure-store";

// Device-local user preferences that must survive a restart. Kept separate from
// `auth/session.ts` (identity) so writing a preference never touches the session
// record. SecureStore rather than plain storage because it is already a dependency
// and custom instructions can contain personal details ("call me …", health, work).

const CUSTOM_INSTRUCTIONS_KEY = "audric.custom-instructions.v1";

/** Same cap the sheet's TextInput enforces — re-checked here and server-side. */
export const CUSTOM_INSTRUCTIONS_MAX = 2000;

export async function loadCustomInstructions(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(CUSTOM_INSTRUCTIONS_KEY)) ?? "";
  } catch {
    // A read failure must not block the app — degrade to "no instructions".
    return "";
  }
}

export async function saveCustomInstructions(text: string): Promise<void> {
  const trimmed = text.trim().slice(0, CUSTOM_INSTRUCTIONS_MAX);
  try {
    if (trimmed) {
      await SecureStore.setItemAsync(CUSTOM_INSTRUCTIONS_KEY, trimmed);
    } else {
      // Empty means "no standing instructions" — delete rather than store "".
      await SecureStore.deleteItemAsync(CUSTOM_INSTRUCTIONS_KEY);
    }
  } catch (e) {
    console.warn(
      "[prefs] custom-instructions save failed:",
      e instanceof Error ? e.message : String(e)
    );
  }
}
