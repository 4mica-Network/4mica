import { fetchDeveloper } from "@stores/developer/actions";
import { selectIsDeveloperLoading } from "@stores/developer/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ApiKeysCard } from "./developer/ApiKeysCard";
import { RevealedSecretBanner } from "./developer/RevealedSecret";
import { WebhooksCard } from "./developer/WebhooksCard";
import { SettingsPage } from "./SettingsPage";

export function DeveloperSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isLoading = useAppSelector(selectIsDeveloperLoading);

  useEffect(() => {
    dispatch(fetchDeveloper());
  }, [dispatch]);

  return (
    <SettingsPage
      titleKey="page.settings.developer.title"
      descriptionKey="page.settings.developer.description"
    >
      {isLoading ? (
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
