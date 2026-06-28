// Audric's settings card pattern — soft, translucent, blended. Reused verbatim
// so the console matches audric.ai's polish (rounded-2xl · border-border/50 ·
// bg-card/40 · small text-sm titles).

export function Section({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
      {title ? (
        <h2 className="font-medium text-foreground text-sm">{title}</h2>
      ) : null}
      {description ? (
        <p className="mt-0.5 mb-3 text-muted-foreground text-xs">
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="font-medium text-foreground text-sm">{title}</div>
        <p className="mt-0.5 text-muted-foreground text-xs">{desc}</p>
      </div>
      {children}
    </div>
  );
}
