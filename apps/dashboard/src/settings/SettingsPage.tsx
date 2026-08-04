import { useAppSelector } from "@stores/hooks";
import { selectIsUserLoading } from "@stores/user/selector";
import { useTitle } from "ahooks";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

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
      <div className="top-0 z-10 flex w-full items-center">
        <Link to="/" className="group flex items-center text-ink-muted">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="ml-2.5 whitespace-nowrap text-sm underline-offset-2 group-hover:underline">
            {t("settings.backToApp")}
          </span>
        </Link>
      </div>

      <div className="mt-5 flex w-full flex-1 animate-fade-in flex-col gap-5 overflow-y-auto pt-6 pr-3 pb-10">
        <div className="mx-auto flex w-full flex-col gap-4 lg:max-w-3xl">
          <div className="flex w-full flex-col items-start">
            <h2 className="font-semibold text-ink-strong text-lg">{title}</h2>
            <p className="text-ink-muted text-sm">{t(descriptionKey)}</p>
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
