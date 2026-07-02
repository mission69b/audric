import Constants from "expo-constants";

// Resolves a relative API path (e.g. "/api/chat") to an absolute URL the NATIVE
// app can reach. Expo Router API routes are served by the same server that serves
// the app, but a device/emulator can't use a relative URL — it needs the origin.
//
// Dev: derive the dev-server origin from Expo's `experienceUrl` (`exp://host:port`
//      → `http://host:port`), so it works on a simulator, an emulator, and a
//      physical device on the LAN without hardcoding an IP.
// Prod: `EXPO_PUBLIC_API_BASE_URL` — the deployed API origin.
//
// Mirrors the pattern in Expo's own AI SDK guide.
export function generateAPIUrl(relativePath: string): string {
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;

  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL.concat(path);
  }

  const origin = Constants.experienceUrl?.replace("exp://", "http://");
  if (!origin) {
    throw new Error(
      "generateAPIUrl: no dev-server origin (Constants.experienceUrl is empty) and EXPO_PUBLIC_API_BASE_URL is unset."
    );
  }
  return origin.concat(path);
}
