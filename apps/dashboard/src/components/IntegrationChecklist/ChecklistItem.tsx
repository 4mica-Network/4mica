import { cn } from "@4mica/ui";
import { Check, Circle, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import type { ChecklistItem as Item } from "./useChecklist";

export function ChecklistItem({ item }: { item: Item }) {
  const { t } = useTranslation();

  const icon = () => {
    if (item.done) {
      return <Check className="h-3 w-3" strokeWidth={3} />;
    }
    if (item.pending) {
      return <Clock className="h-3 w-3" />;
    }
    return <Circle className="h-2 w-2" />;
  };

  return (
    <li>
      <NavLink
        to={item.to}
        className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-overlay/5"
      >
        <span
          className={cn(
            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
            item.done && "border-transparent bg-success text-surface-deep",
            item.pending && "border-warning/40 text-warning",
            !item.done && !item.pending && "border-overlay/20 text-ink-subtle",
          )}
        >
          {icon()}
        </span>

        <span className="min-w-0">
          <span
            className={cn(
              "block font-medium text-sm",
              item.done ? "text-ink-muted line-through" : "text-ink-strong",
            )}
          >
            {item.title}
          </span>
          <span className="mt-0.5 block text-ink-muted text-xs">
            {item.pending ? t("checklist.kybPending") : item.hint}
          </span>
        </span>
      </NavLink>
    </li>
  );
}
