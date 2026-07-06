import { ApiKeysSection } from "@/components/api-keys-section";
import { PanelHead } from "@/components/panel-head";

export default function KeysPage() {
  return (
    <>
      <PanelHead
        sub="Keys authorize paid model calls, drawn from your Credit balance. Rotate anytime."
        title="API keys"
      />
      <ApiKeysSection />
    </>
  );
}
