import { PanelHead } from "@/components/panel-head";
import { UsageSection } from "@/components/usage-section";

export default function UsagePage() {
  return (
    <>
      <PanelHead
        sub="API calls drawn from Credit. Marketplace buys live under Earnings."
        title="Usage"
      />
      <UsageSection />
    </>
  );
}
