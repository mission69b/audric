/**
 * Legal route-group layout (R6.6 6d). The per-doc `LegalShell` now provides
 * the back link, doc-tabs nav, sticky-TOC frame, and prose scale, so this
 * layout is just the page container (phase2 `main` max-width 1080px). The
 * previous bottom footer-links row was folded into the doc-tabs pill nav.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1080px] px-5 py-14 sm:px-6 sm:py-20">
        {children}
      </div>
    </main>
  );
}
