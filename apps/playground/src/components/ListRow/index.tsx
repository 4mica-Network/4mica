import Link from "next/link";
import type { ReactNode } from "react";

export interface ListRowProps {
  href: string;
  title: string;
  description: string | null;
  tags?: ReactNode;
  action?: ReactNode;
}

export function ListRow({
  href,
  title,
  description,
  tags,
  action,
}: ListRowProps) {
  return (
    <div className="relative flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-overlay/5 has-[a:focus-visible]:bg-overlay/5">
      <div className="flex flex-col gap-1.5">
        <h3 className="font-semibold text-ink-strong">
          <Link className="after:absolute after:inset-0" href={href}>
            {title}
          </Link>
        </h3>
        {description && (
          <p className="text-ink-muted text-sm leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {tags && <div className="flex flex-wrap items-center gap-2">{tags}</div>}

      {action && <div className="relative z-10 w-fit">{action}</div>}
    </div>
  );
}
