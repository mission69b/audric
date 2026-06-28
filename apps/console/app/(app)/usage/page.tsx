import { UsageSection } from "@/components/usage-section";

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl text-[var(--foreground)] tracking-tight">
          Usage
        </h1>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Tokens, requests, and spend by model.
        </p>
      </div>
      <UsageSection />
    </div>
  );
}
