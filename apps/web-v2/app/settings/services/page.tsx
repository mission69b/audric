"use client";

import { useZkLogin } from "@/components/auth/use-zklogin";
import { ServicesSpendingSection } from "@/components/settings/services-spending-section";
import { ServicesUsageSection } from "@/components/settings/services-usage-section";

export default function ServicesPage() {
  const { address } = useZkLogin();
  return (
    <div className="flex flex-col gap-6">
      <ServicesSpendingSection address={address} />
      <ServicesUsageSection address={address} />
    </div>
  );
}
