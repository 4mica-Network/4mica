import { fetchDeveloper } from "@stores/developer/actions";
import {
  selectDeveloperError,
  selectHasLoadedDeveloper,
  selectIsDeveloperLoading,
} from "@stores/developer/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useEffect } from "react";
import { RetryState } from "@/components/LoadFailure";
import { PageSpinner } from "@/components/PageSpinner";
import { RevealedSecretBanner } from "@/components/RevealedSecret";
import { SettingsPage } from "@/components/SettingsPage";
import { useEphemeralSecret } from "@/hooks/useEphemeralSecret";
import { ApiKeysCard } from "./ApiKeysCard";
import { WebhooksCard } from "./WebhooksCard";

export function DeveloperSettings() {
  const dispatch = useAppDispatch();
  const isLoading = useAppSelector(selectIsDeveloperLoading);
  const hasLoaded = useAppSelector(selectHasLoadedDeveloper);
  const error = useAppSelector(selectDeveloperError);
  const { secret, reveal, clear } = useEphemeralSecret();

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
      ) : !hasLoaded && error ? (
        <RetryState
          message={error}
          onRetry={() => dispatch(fetchDeveloper())}
        />
      ) : (
        <>
          <RevealedSecretBanner secret={secret} onDismiss={clear} />
          <ApiKeysCard onReveal={reveal} />
          <WebhooksCard onReveal={reveal} />
        </>
      )}
    </SettingsPage>
  );
}
