import { EmptyState } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchUser } from "@stores/user/actions";
import { selectIsUserLoading, selectUserState } from "@stores/user/selector";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageSpinner } from "@/components/PageSpinner";
import { usePageTitle } from "@/hooks/usePageTitle";

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
  const dispatch = useAppDispatch();
  const isLoading = useAppSelector(selectIsUserLoading);
  const { user, error } = useAppSelector(selectUserState);
  const title = t(titleKey);
  usePageTitle(title);

  return (
    <div className="flex size-full min-h-0 flex-col">
      <div className="flex w-full flex-1 animate-fade-in flex-col overflow-y-auto pr-3 pb-10">
        <div className="mx-auto flex w-full flex-col gap-8 lg:max-w-3xl">
          <div className="flex w-full flex-col items-start">
            <h2 className="font-semibold text-ink-strong text-lg">{title}</h2>
            <p className="mt-1 text-ink-muted text-sm">{t(descriptionKey)}</p>
          </div>

          {isLoading ? (
            <PageSpinner />
          ) : !user && error ? (
            <EmptyState
              icon={<TriangleAlert className="h-5 w-5" />}
              title={t("settings.loadFailure.title")}
              description={error}
              action={{
                label: t("loadFailure.retry"),
                onClick: () => dispatch(fetchUser()),
              }}
              data-testid="settings-load-failure"
            />
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
