import * as SecureStore from "expo-secure-store";

// Device-local user preferences that must survive a restart. Kept separate from
// `auth/session.ts` (identity) so writing a preference never touches the session
// record. SecureStore rather than plain storage because it is already a dependency
// and custom instructions can contain personal details ("call me …", health, work).

const CUSTOM_INSTRUCTIONS_KEY = "audric.custom-instructions.v1";
const THEME_OVERRIDE_KEY = "audric.theme-override.v1";
const ONBOARDED_KEY = "audric.onboarded.v1";
const CHAT_MODEL_KEY = "audric.chat-model.v1";

/** Same cap the sheet's TextInput enforces — re-checked here and server-side. */
export const CUSTOM_INSTRUCTIONS_MAX = 2000;

// Theme override — "system" follows the OS; "light"/"dark" pin a scheme. Persisted so
// a `/theme` toggle (or a settings pick) survives a cold restart instead of snapping
// back to the OS default. Kept as a plain string union to avoid importing from the
// theme module (which imports this one).
export type StoredThemeOverride = "light" | "dark" | "system";

export async function loadThemeOverride(): Promise<StoredThemeOverride> {
  try {
    const v = await SecureStore.getItemAsync(THEME_OVERRIDE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    // A read failure must not block the app — degrade to "follow the OS".
    return "system";
  }
}

export async function saveThemeOverride(o: StoredThemeOverride): Promise<void> {
  try {
    if (o === "system") {
      // "system" is the default — delete rather than store it.
      await SecureStore.deleteItemAsync(THEME_OVERRIDE_KEY);
    } else {
      await SecureStore.setItemAsync(THEME_OVERRIDE_KEY, o);
    }
  } catch (e) {
    console.warn(
      "[prefs] theme-override save failed:",
      e instanceof Error ? e.message : String(e)
    );
  }
}

// Onboarding-complete flag — set once the user finishes (or skips) the first-launch
// carousel, so a valid returning session never replays it on a cold start.
export async function loadOnboarded(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ONBOARDED_KEY)) === "1";
  } catch {
    // A read failure must not trap a returning user in onboarding — treat as done.
    return true;
  }
}

export async function saveOnboarded(done: boolean): Promise<void> {
  try {
    if (done) {
      await SecureStore.setItemAsync(ONBOARDED_KEY, "1");
    } else {
      await SecureStore.deleteItemAsync(ONBOARDED_KEY);
    }
  } catch (e) {
    console.warn(
      "[prefs] onboarded save failed:",
      e instanceof Error ? e.message : String(e)
    );
  }
}

// Selected chat model — web-v3 keeps the same choice in its `chat-model` cookie, so a
// reload never silently drops the user back to Auto. "Auto" is the default and is
// stored as an absence. Cleared on sign-out (see `clearChatModel`), matching web-v3,
// so the next account never inherits the previous user's pick.
export const DEFAULT_CHAT_MODEL = "Auto";

export async function loadChatModel(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(CHAT_MODEL_KEY)) || DEFAULT_CHAT_MODEL;
  } catch {
    // A read failure must not block the app — degrade to the default router.
    return DEFAULT_CHAT_MODEL;
  }
}

export async function saveChatModel(model: string): Promise<void> {
  try {
    if (model && model !== DEFAULT_CHAT_MODEL) {
      await SecureStore.setItemAsync(CHAT_MODEL_KEY, model);
    } else {
      await SecureStore.deleteItemAsync(CHAT_MODEL_KEY);
    }
  } catch (e) {
    console.warn(
      "[prefs] chat-model save failed:",
      e instanceof Error ? e.message : String(e)
    );
  }
}

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
