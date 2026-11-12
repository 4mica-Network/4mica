import { cn } from "@4mica/ui";
import type { ReactNode } from "react";
import { AppBar } from "@/components/AppBar";

export interface CardShellProps {
  actions?: ReactNode;
  nav?: ReactNode;
  title?: string;
  account?: ReactNode;
  children: ReactNode;
}

export function CardShell({
  actions,
  nav,
  title,
  account,
  children,
}: CardShellProps) {
  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col md:justify-center md:gap-3"
      data-fit-viewport
    >
      <AppBar account={account} actions={actions} nav={nav} title={title} />

      {actions && <div className="hidden justify-end md:flex">{actions}</div>}

      <section className="flex flex-1 flex-col md:grid md:max-h-[40rem] md:min-h-0 md:grid-cols-[19rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden md:rounded-2xl md:border md:border-overlay/10 md:bg-overlay/2">
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
        "shrink-0 border-overlay/10 border-b px-4 py-6 sm:p-8 md:max-h-none md:overflow-y-auto md:border-r md:border-b-0",
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function CardMain({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col md:min-h-0">{children}</div>
  );
}
