import { cn } from "@4mica/ui";
import type { ReactNode } from "react";

export interface CardShellProps {
  actions?: ReactNode;
  children: ReactNode;
}

export function CardShell({ actions, children }: CardShellProps) {
  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col justify-center gap-3"
      data-fit-viewport
    >
      {actions && <div className="flex justify-end">{actions}</div>}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-overlay/10 bg-overlay/2 md:grid md:max-h-[40rem] md:grid-cols-[19rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
        {children}
      </section>
    </div>
  );
}

export function CardAside({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "max-h-[45%] shrink-0 overflow-y-auto border-overlay/10 border-b p-6 sm:p-8 md:max-h-none md:border-r md:border-b-0",
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function CardMain({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>;
}
