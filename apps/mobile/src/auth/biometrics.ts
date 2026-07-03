import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

// Biometric app-lock primitives (expo-local-authentication, SDK 57). This is the
// device-security layer — NOT wallet signing (there is no on-device key yet;
// Phase 0). It gates opening the app over the Keychain-stored session, the same
// "unlock to continue" pattern Claude/ChatGPT and every wallet app use.
//
// "Does this device support Face ID?" is three questions, all answered here:
//   • hasHardwareAsync()  — a biometric sensor physically exists,
//   • isEnrolledAsync()   — the user has actually set up a face/finger,
//   • supportedAuthenticationTypesAsync() — WHICH kind (Face ID vs Touch ID vs …).
// Support = hardware AND enrolled; the UI hides the toggle otherwise.
//
// iOS Face ID needs `NSFaceIDUsageDescription` (added via the config plugin in
// app.json) and a DEVELOPMENT BUILD — the Face ID prompt does not run in Expo Go.
// Touch ID / Android biometrics work in Expo Go.

export type BiometricCapability = {
  /** hardware present AND a face/finger enrolled — the only gate the UI needs. */
  available: boolean;
  hasHardware: boolean;
  enrolled: boolean;
  faceId: boolean;
  fingerprint: boolean;
  /** Human label for the primary method on this device ("Face ID", "Touch ID", …). */
  label: string;
};

function labelFor(faceId: boolean, fingerprint: boolean): string {
  if (Platform.OS === "ios") {
    if (faceId) return "Face ID";
    if (fingerprint) return "Touch ID";
    return "Biometrics";
  }
  if (faceId) return "Face Unlock";
  if (fingerprint) return "Fingerprint";
  return "Biometrics";
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  const [hasHardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const faceId = types.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
  );
  const fingerprint = types.includes(
    LocalAuthentication.AuthenticationType.FINGERPRINT
  );
  return {
    available: hasHardware && enrolled,
    hasHardware,
    enrolled,
    faceId,
    fingerprint,
    label: labelFor(faceId, fingerprint),
  };
}

// Prompt the OS biometric sheet. `disableDeviceFallback` stays false so a failed
// face read falls back to the device passcode instead of dead-ending — right for
// an app lock. (A future wallet-signing gate can pass true for biometrics-only.)
export async function authenticate(promptMessage: string): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  return res.success;
}

// One-shot capability probe for UI (null while loading). The Settings toggle gates
// its own visibility on `cap?.available`.
export function useBiometricCapability(): BiometricCapability | null {
  const [cap, setCap] = useState<BiometricCapability | null>(null);
  useEffect(() => {
    let alive = true;
    getBiometricCapability().then((c) => {
      if (alive) setCap(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return cap;
}
