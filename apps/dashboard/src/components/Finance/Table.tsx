import { cn } from "@4mica/ui";
import type { ReactNode } from "react";

export function Table({
  columns,
  children,
  "data-testid": testId,
}: {
  columns: { label: string; align?: "right" }[];
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-overlay/10">
      <table className="w-full text-left" data-testid={testId}>
        <thead className="bg-overlay/5 text-2xs text-ink-subtle uppercase tracking-wide">
          <tr>
            {columns.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-4 py-2 font-medium",
                  column.align === "right" && "text-right",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-overlay/10">{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({
  children,
  align,
  className,
}: {
  children: ReactNode;
  align?: "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-top text-ink-body text-sm",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}
