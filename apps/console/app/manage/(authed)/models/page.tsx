import { ModelsSection } from "@/components/models-section";
import { PanelHead } from "@/components/panel-head";

export default function ModelsPage() {
  return (
    <>
      <PanelHead
        sub="What Credit buys. Confidential models run in a TEE; Private models are proxied, never trained on."
        title="Models"
      />
      <ModelsSection />
    </>
  );
}
