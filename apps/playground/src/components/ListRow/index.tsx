import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export interface ListRowProps {
  href: string;
  title: string;
  description: string | null;
  tags?: ReactNode;
}

export function ListRow({ href, title, description, tags }: ListRowProps) {
  return (
    <div className="relative flex flex-col gap-3 py-4 pr-10 pl-4 transition-colors hover:bg-overlay/5 active:bg-overlay/5 has-[a:focus-visible]:bg-overlay/5 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-brand has-[a:focus-visible]:-outline-offset-2 sm:pl-6 md:px-6">
      <ChevronRight
        aria-hidden="true"
        className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-ink-subtle md:hidden"
      />
      <div className="flex flex-col gap-1.5">
        <h3 className="font-semibold text-ink-strong">
          <Link
            className="after:absolute after:inset-0 focus-visible:outline-none"
            href={href}
          >
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
    </div>
  );
}
