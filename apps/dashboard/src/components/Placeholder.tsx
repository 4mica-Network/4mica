import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, PageHeader } from "./ui";

/**
 * Consistent stub for pages that are part of the app shell but not yet wired to
 * real data. Keeps the whole console feeling coherent while features land.
 */
export function Placeholder({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <PageHeader title={title} subtitle={description} />
      {children ?? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-overlay/10 text-ink-muted">
            <Icon className="h-5 w-5" />
          </span>
          <div className="text-ink-muted text-sm">
            <span className="font-medium text-ink-body">{title}</span> lives
            here.
            <br />
            Wire it to the live 4Mica API to light it up.
          </div>
        </Card>
      )}
    </div>
  );
}
