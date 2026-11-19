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
      className="inline-flex items-stretch gap-0.5 rounded-xl border border-overlay/10 bg-overlay/4 p-0.5 text-sm max-md:rounded-lg"
    >
      {options.map((option) => {
        const selected = option.id === view;

        return (
          <Link
            aria-current={selected ? "page" : undefined}
            className={cn(
              "inline-flex items-center whitespace-nowrap rounded-lg px-3 transition-colors max-md:rounded-md max-md:px-2.5",
              selected
                ? "bg-overlay/10 text-ink-strong"
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
    </nav>
  );
}
