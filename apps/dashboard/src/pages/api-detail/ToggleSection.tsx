import { Switch } from "@4mica/ui";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function ToggleSection({
  id,
  title,
  description,
  checked,
  onToggle,
  isSaving,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  isSaving?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-base text-ink-strong">{title}</h3>
          {description && (
            <p className="mt-1 text-ink-muted text-sm">{description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isSaving && (
            <Loader2
              aria-label={t("settings.saving")}
              className="h-3.5 w-3.5 animate-spin text-ink-subtle"
              role="status"
            />
          )}
          <Switch
            aria-label={title}
            data-testid={id}
            initialState={checked}
            onToggle={onToggle}
          />
        </div>
      </div>

      {checked ? (
        children
      ) : (
        <p className="rounded-lg border border-overlay/10 border-dashed px-4 py-3 text-ink-subtle text-sm">
          {t("appDetail.hiddenFromBuyers")}
        </p>
      )}
    </section>
  );
}
