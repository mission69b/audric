// Console card (t2000-design/agents ManageConsole panels) — every settings
// block is an ag-card with a 14/600 title + 12.5 muted sub. One component,
// so keys/usage/models/billing reskin at a single point.

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
    <div className="ag-card p-5">
      {title ? (
        <h2 className="m-0 font-semibold text-[14px] text-foreground">
          {title}
        </h2>
      ) : null}
      {description ? (
        <p className="mt-1 mb-3 text-[12.5px] text-fg-muted">{description}</p>
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
