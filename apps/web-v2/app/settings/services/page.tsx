"use client";

import { useZkLogin } from "@/components/auth/use-zklogin";
import { ServicesSpendingSection } from "@/components/settings/services-spending-section";

export default function ServicesPage() {
  const { address } = useZkLogin();
  return <ServicesSpendingSection address={address} />;
}
