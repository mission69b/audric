import type { Metadata } from "next";
import { ProductPage } from "@/components/ProductPage";

export const metadata: Metadata = {
  title: "Send — Audric",
  description:
    "Send USDC to anyone, anywhere. Instant settlement, no fees beyond gas.",
};

export default function SendPage() {
  return (
    <ProductPage
      badge="Send"
      title="Send USDC anywhere. Instantly."
      subtitle="Transfer USDC to any Sui address. Cross-border, sub-second settlement, no fees beyond gas."
      stats={[
        { label: "Settlement", value: "<1 sec" },
        { label: "Fees", value: "Gas only" },
        { label: "Borders", value: "None" },
      ]}
      steps={[
        {
          number: "1",
          title: "Say who and how much",
          description:
            "\"Send $50 to 0x1a2b...\" or \"Send $20 to Alex.\" Paste an address or pick a contact.",
        },
        {
          number: "2",
          title: "Confirm the transaction",
          description:
            "Audric shows you the recipient, amount, and estimated gas. Approve to send.",
        },
        {
          number: "3",
          title: "Delivered",
          description:
            "USDC arrives in under a second. Both parties get a confirmation with the transaction link.",
        },
      ]}
      cta="Send USDC"
      ctaPrompt="Send USDC"
    />
  );
}
