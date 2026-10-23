import { fetchDeveloper } from "@stores/developer/actions";
import {
  selectHasLoadedDeveloper,
  selectIsDeveloperLoading,
} from "@stores/developer/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useEffect } from "react";
import { PageSpinner } from "@/components/PageSpinner";
import { RevealedSecretBanner } from "@/components/RevealedSecret";
import { SettingsPage } from "@/components/SettingsPage";
import { ApiKeysCard } from "./ApiKeysCard";
import { WebhooksCard } from "./WebhooksCard";

export function DeveloperSettings() {
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
      {isLoading && !hasLoaded ? (
        <PageSpinner />
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
