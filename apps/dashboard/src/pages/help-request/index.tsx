import { Button } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  fetchSupportRequest,
  resetSupportRequest,
} from "@stores/support/actions";
import {
  selectCurrentSupportRequest,
  selectCurrentSupportRequestError,
  selectIsLoadingCurrentSupportRequest,
} from "@stores/support/selector";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { BackBar } from "@/components/BackBar";
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
      <div className="flex flex-col items-start gap-4 py-10">
        <p className="text-ink-muted text-sm">{t("help.detail.notFound")}</p>
        <Button asChild intent="outline" size="sm">
          <Link to="/help">{t("help.detail.back")}</Link>
        </Button>
      </div>
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
