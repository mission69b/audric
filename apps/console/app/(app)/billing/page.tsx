import { BillingSection } from "@/components/billing-section";

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl text-[var(--foreground)] tracking-tight">
          Billing
        </h1>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Top up your credit and manage auto-recharge.
        </p>
      </div>
      <BillingSection />
    </div>
  );
}
