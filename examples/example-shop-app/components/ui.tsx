import type { ReactNode } from "react";

export const shortenAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

export function Row({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="min-w-0 truncate text-ink-subtle">{label}</span>
      <span className="min-w-0 truncate text-ink-body">{children}</span>
    </div>
  );
}
