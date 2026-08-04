import { Button } from "@4mica/ui";
import { useAppSelector } from "@stores/hooks";
import { selectIsUserLoading } from "@stores/user/selector";
import { useTitle } from "ahooks";
import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function SettingsForm({
  titleKey,
  descriptionKey,
  isDirty,
  isSaving,
  onSubmit,
  onReset,
  children,
}: {
  titleKey: string;
  descriptionKey: string;
  isDirty: boolean;
  isSaving: boolean;
  onSubmit: () => void;
  onReset: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const isLoading = useAppSelector(selectIsUserLoading);
  const title = t(titleKey);
  useTitle(`${title} - ${t("org")}`);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <header>
        <h2 className="font-semibold text-ink-strong text-lg">{title}</h2>
        <p className="mt-1 text-ink-muted text-sm">{t(descriptionKey)}</p>
      </header>

      {isLoading ? (
        <p className="mt-6 text-ink-muted text-sm">{t("settings.loading")}</p>
      ) : (
        <>
          <div className="mt-2">{children}</div>

          <div className="sticky bottom-0 mt-6 flex items-center justify-end gap-2 border-overlay/10 border-t bg-surface-deep py-4">
            <Button
              type="button"
              intent="ghost"
              size="sm"
              disabled={!isDirty || isSaving}
              onClick={onReset}
            >
              {t("settings.discard")}
            </Button>
            <Button type="submit" size="sm" disabled={!isDirty || isSaving}>
              {isSaving ? t("settings.saving") : t("settings.save")}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
