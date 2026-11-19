import { cn } from "@4mica/ui";
import Link from "next/link";
import { messages } from "@/i18n";

export type IntegrationView = "seller" | "buyer";

export const parseView = (
  isOwner: boolean,
  value: string | string[] | undefined,
): IntegrationView => (isOwner && value !== "buyer" ? "seller" : "buyer");

export interface ViewSwitchProps {
  view: IntegrationView;
}

export function ViewSwitch({ view }: ViewSwitchProps) {
  const options = [
    { id: "seller", label: messages.view.seller, href: "?view=seller" },
    { id: "buyer", label: messages.view.buyer, href: "?view=buyer" },
  ] as const;

  return (
    <nav
      aria-label={messages.view.label}
      className="flex items-center gap-2 text-xs"
    >
      <span className="text-ink-muted">{messages.view.label}</span>
      <div className="inline-flex items-center gap-0.5 rounded-md border border-overlay/6 p-0.5">
        {options.map((option) => {
          const selected = option.id === view;

          return (
            <Link
              aria-current={selected ? "page" : undefined}
              className={cn(
                "inline-flex h-6 items-center rounded px-2.5 transition-colors",
                selected
                  ? "bg-overlay/8 text-ink-strong"
                  : "text-ink-muted hover:text-ink-body",
              )}
              href={option.href}
              key={option.id}
              replace
              scroll={false}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
