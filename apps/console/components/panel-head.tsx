// Console panel header (t2000-design/agents ManageConsole §PanelHead):
// 26px display title + 13.5px muted sub + an optional right-aligned action.
export function PanelHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 font-semibold text-[26px] text-foreground tracking-[-0.03em]">
          {title}
        </h1>
        {sub && <p className="mt-1.5 mb-0 text-[13.5px] text-fg-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
