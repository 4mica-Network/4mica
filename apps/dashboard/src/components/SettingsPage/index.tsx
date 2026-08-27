import { useAppSelector } from "@stores/hooks";
import { selectIsUserLoading } from "@stores/user/selector";
import { useTitle } from "ahooks";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function SettingsPage({
  titleKey,
  descriptionKey,
  children,
}: {
  titleKey: string;
  descriptionKey: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const isLoading = useAppSelector(selectIsUserLoading);
  const title = t(titleKey);
  useTitle(`${title} - ${t("org")}`);

  return (
    <div className="flex size-full min-h-0 flex-col">
      <div className="flex w-full flex-1 animate-fade-in flex-col overflow-y-auto pr-3 pb-10">
        <div className="mx-auto flex w-full flex-col gap-8 lg:max-w-3xl">
          <div className="flex w-full flex-col items-start">
            <h2 className="font-semibold text-ink-strong text-lg">{title}</h2>
            <p className="mt-1 text-ink-muted text-sm">{t(descriptionKey)}</p>
          </div>

          {isLoading ? (
            <p className="text-ink-muted text-sm">{t("settings.loading")}</p>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
