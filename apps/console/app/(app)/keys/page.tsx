import { ApiKeysSection } from "@/components/api-keys-section";

export default function KeysPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl text-[var(--foreground)] tracking-tight">
          API keys
        </h1>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Create, view, and revoke keys for the Private API.
        </p>
      </div>
      <ApiKeysSection />
    </div>
  );
}
