import { ModelsSection } from "@/components/models-section";

export default function ModelsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl text-[var(--foreground)] tracking-tight">
          Models
        </h1>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Every model behind one key — private by default.
        </p>
      </div>
      <ModelsSection />
    </div>
  );
}
