import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  fetchSupportRequest,
  resetSupportRequest,
  selectCurrentSupportRequest,
  selectCurrentSupportRequestError,
  selectCurrentSupportRequestNotFound,
  selectIsLoadingCurrentSupportRequest,
} from "@stores/support";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { BackBar } from "@/components/BackBar";
import { LoadFailure } from "@/components/LoadFailure";
import { PageSpinner } from "@/components/PageSpinner";
import { usePageTitle } from "@/hooks/usePageTitle";
import { RemovePanel } from "./RemovePanel";
import { RequestPanel } from "./RequestPanel";
import { StatusPanel } from "./StatusPanel";

export function HelpRequestDetail() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { id = "" } = useParams<{ id: string }>();

  const request = useAppSelector(selectCurrentSupportRequest);
  const isLoading = useAppSelector(selectIsLoadingCurrentSupportRequest);
  const loadError = useAppSelector(selectCurrentSupportRequestError);
  const notFound = useAppSelector(selectCurrentSupportRequestNotFound);

  usePageTitle(
    request
      ? `${request.subject} · ${t("page.help.title")}`
      : t("page.help.title"),
  );

  useEffect(() => {
    if (!id) {
      return;
    }
    dispatch(fetchSupportRequest(id));
    return () => {
      dispatch(resetSupportRequest());
    };
  }, [dispatch, id]);

  if (!request && (isLoading || !loadError)) {
    return <PageSpinner />;
  }

  if (!request) {
    return (
      <LoadFailure
        notFound={notFound || !loadError}
        notFoundLabel={t("help.detail.notFound")}
        message={loadError}
        onRetry={() => dispatch(fetchSupportRequest(id))}
        backTo="/help"
        backLabel={t("help.detail.back")}
      />
    );
  }

  return (
    <div className="flex w-full animate-fade-in flex-col pb-16">
      <BackBar label={t("help.detail.back")} to="/help" />

      <div className="mx-auto flex w-full flex-col gap-6 lg:max-w-3xl">
        <StatusPanel request={request} />

        <RequestPanel request={request} />

        <RemovePanel request={request} />
      </div>
    </div>
  );
}
