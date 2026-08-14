import Link from "next/link";
import type { ReactNode } from "react";

export interface ListRowProps {
  href: string;
  title: string;
  description: string | null;
  /** Tag elements rendered under the description. */
  tags?: ReactNode;
  /** Owner-only control. Sits above the row link so it stays clickable. */
  action?: ReactNode;
}

/**
 * One line item in a ListSection.
 *
 * The whole row is clickable via `after:absolute after:inset-0` on the title
 * link rather than by wrapping everything in an anchor — nesting the owner's
 * visibility toggle inside a link would be invalid HTML, and the pseudo-element
 * lets that control sit above the hit area with a z-index instead.
 */
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
