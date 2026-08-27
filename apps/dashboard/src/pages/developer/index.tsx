import { fetchDeveloper } from "@stores/developer/actions";
import {
  selectHasLoadedDeveloper,
  selectIsDeveloperLoading,
} from "@stores/developer/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SettingsPage } from "@/components/SettingsPage";
import { ApiKeysCard } from "./ApiKeysCard";
import { RevealedSecretBanner } from "./RevealedSecret";
import { WebhooksCard } from "./WebhooksCard";

export function DeveloperSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isLoading = useAppSelector(selectIsDeveloperLoading);
  const hasLoaded = useAppSelector(selectHasLoadedDeveloper);

  useEffect(() => {
    dispatch(fetchDeveloper());
  }, [dispatch]);

  return (
    <SettingsPage
      titleKey="page.settings.developer.title"
      descriptionKey="page.settings.developer.description"
    >
      {/* Only blank the page on the very first load. Later re-fetches redraw
          the same content, so showing a spinner over it is just a flicker. */}
      {isLoading && !hasLoaded ? (
        <p className="text-ink-muted text-sm">{t("settings.loading")}</p>
      ) : (
        <>
          <RevealedSecretBanner />
          <ApiKeysCard />
          <WebhooksCard />
        </>
      )}
    </SettingsPage>
  );
}
