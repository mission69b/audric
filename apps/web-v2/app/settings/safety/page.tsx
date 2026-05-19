"use client";

import { useZkLogin } from "@/components/auth/use-zklogin";
import { SafetySection } from "@/components/settings/safety-section";

export default function SafetyPage() {
  const { address } = useZkLogin();
  return <SafetySection address={address} />;
}
