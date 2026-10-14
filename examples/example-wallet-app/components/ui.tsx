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

export function FieldRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor={id} className="font-medium text-ink-muted text-sm">
        {label}
      </label>
      <div className="flex items-stretch gap-3">{children}</div>
    </div>
  );
}
