import Link from "next/link";
import type { NavLinkItem } from "./navData";

export default function DropdownMenuItem({
  item,
  onClick,
}: {
  item: NavLinkItem;
  onClick?: () => void;
}) {
  const content = (
    <>
      {item.icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-overlay/10 bg-overlay/5 text-ink-strong text-lg transition-colors group-hover/item:border-overlay/30 group-hover/item:bg-overlay/10">
          <i className={item.icon} />
        </span>
      )}
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-ink-strong text-md">
            {item.title}
          </span>
          {item.external && (
            <i className="ri-arrow-right-up-line text-ink-subtle text-md transition-transform group-hover/item:text-ink-muted" />
          )}
        </span>
        {item.description && (
          <span className="whitespace-nowrap text-ink-muted text-md">
            {item.description}
          </span>
        )}
      </span>
    </>
  );

  const className =
    "group/item flex items-center gap-3 rounded-lg py-2.5 pr-8 pl-2.5 transition-colors hover:bg-overlay/5";

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={className}
        onClick={onClick}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={item.href} className={className} onClick={onClick}>
      {content}
    </Link>
  );
}
