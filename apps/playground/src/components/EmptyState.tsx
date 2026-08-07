import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
}

export function EmptyState({ icon, message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-overlay/10 border-dashed px-6 py-10 text-center">
      {icon && <span className="text-ink-subtle">{icon}</span>}
      <p className="text-ink-muted text-sm">{message}</p>
    </div>
  );
}
