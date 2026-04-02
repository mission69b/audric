'use client';

import type { StepStatus } from './AgentStep';

interface AgentSubStepProps {
  icon?: string;
  label: string;
  status: StepStatus;
  detail?: string;
  isLast?: boolean;
}

function SubStepIndicator({ status }: { status: StepStatus }) {
  switch (status) {
    case 'pending':
      return <span className="w-2 h-2 rounded-full border border-border-bright shrink-0" aria-hidden="true" />;
    case 'running':
      return <span className="w-2 h-2 rounded-full bg-foreground shrink-0 animate-pulse" aria-hidden="true" />;
    case 'done':
      return (
        <span className="w-2 h-2 rounded-full bg-success shrink-0 flex items-center justify-center" aria-hidden="true">
          <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
            <path d="M1 3L2.5 4.5L5 2" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case 'error':
      return <span className="w-2 h-2 rounded-full bg-error shrink-0" aria-hidden="true" />;
  }
}

export function AgentSubStep({ icon, label, status, detail, isLast = false }: AgentSubStepProps) {
  return (
    <div className="relative flex items-start gap-2 py-0.5">
      {/* Connector line */}
      {!isLast && (
        <div
          className="absolute left-[3.5px] top-[14px] w-px h-[calc(100%-6px)] bg-border"
          aria-hidden="true"
        />
      )}

      <div className="mt-[5px]">
        <SubStepIndicator status={status} />
      </div>

      <div className="flex items-center gap-1.5 min-w-0">
        {icon && <span className="text-xs leading-none shrink-0">{icon}</span>}
        <span className="font-mono text-[11px] tracking-wider uppercase text-dim truncate">
          {label}
        </span>
        {detail && (
          <span className="font-mono text-[10px] text-muted truncate">
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}
