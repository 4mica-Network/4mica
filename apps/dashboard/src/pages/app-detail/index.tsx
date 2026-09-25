import { Button, Spinner, Tag } from "@4mica/ui";
import { fetchApiListings } from "@stores/apiListing/actions";
import {
  selectApiListings,
  selectHasLoadedApiListings,
} from "@stores/apiListing/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchTrust, resetTrust, savePolicy } from "@stores/trust/actions";
import {
  selectIsTrustPending,
  selectPolicy,
  selectTrustSummary,
} from "@stores/trust/selector";
import { useTitle } from "ahooks";
import { ArrowLeft, ShieldAlert, Star } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { SettingsSection } from "@/components/form";
import { IntegrationGuideLink } from "@/components/IntegrationGuideLink";
import { DetailsForm } from "./DetailsForm";
import { EndpointsSection } from "./EndpointsSection";
import { FaqEditor } from "./FaqEditor";
import { PolicyForm } from "./PolicyForm";
import { ReportsPanel } from "./ReportsPanel";
import { ReviewsPanel } from "./ReviewsPanel";
import { ToggleSection } from "./ToggleSection";

export function AppDetail() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { id = "" } = useParams<{ id: string }>();

  const listings = useAppSelector(selectApiListings);
  const hasLoaded = useAppSelector(selectHasLoadedApiListings);
  const summary = useAppSelector(selectTrustSummary);
  const policy = useAppSelector(selectPolicy);
  const isSavingPolicy = useAppSelector(selectIsTrustPending("savePolicy"));

  const listing = listings.find((row) => row.id === id) ?? null;
  const resource = { kind: "listing" as const, id };

  useTitle(
    listing
      ? `${listing.name} · ${t("appDetail.title")}`
      : t("appDetail.title"),
  );

  useEffect(() => {
    if (!hasLoaded) {
      dispatch(fetchApiListings());
    }
  }, [dispatch, hasLoaded]);

  useEffect(() => {
    if (!id) {
      return;
    }

    dispatch(fetchTrust(resource));

    return () => {
      dispatch(resetTrust());
    };
  }, [dispatch, id]);

  if (!hasLoaded && !listing) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="flex flex-col items-start gap-4 py-10">
        <p className="text-ink-muted text-sm">{t("appDetail.notFound")}</p>
        <Button asChild intent="outline" size="sm">
          <Link to="/apps">{t("appDetail.backToApps")}</Link>
        </Button>
      </div>
    );
  }

  const policyEnabled = policy?.policyEnabled ?? true;
  const faqEnabled = policy?.faqEnabled ?? true;

  return (
    <div className="relative flex size-full min-h-0 flex-col">
      <div className="pointer-events-none sticky top-0 z-20 -mb-10">
        <Button
          asChild
          className="pointer-events-auto"
          intent="ghost"
          size="sm"
        >
          <Link to="/apps">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("appDetail.backToApps")}
          </Link>
        </Button>
      </div>

      <div className="flex w-full flex-1 animate-fade-in flex-col overflow-y-auto pr-3 pb-16">
        <div className="mx-auto flex w-full flex-col gap-10 pt-12 lg:max-w-3xl">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-semibold text-2xl text-ink-strong tracking-tight">
                {listing.name}
              </h1>

              {summary && summary.ratingCount > 0 && (
                <Tag size="sm" variant="neutral">
                  <Star className="mr-1 h-3 w-3 fill-warning text-warning" />
                  {(summary.ratingAverage ?? 0).toFixed(1)} ·{" "}
                  {summary.ratingCount}
                </Tag>
              )}

              {summary && summary.openReports > 0 && (
                <Tag size="sm" variant="warning">
                  <ShieldAlert className="mr-1 h-3 w-3" />
                  {t("appDetail.openReports", { count: summary.openReports })}
                </Tag>
              )}
            </div>

            {listing.summary && (
              <p className="text-ink-muted text-sm">{listing.summary}</p>
            )}

            <IntegrationGuideLink
              isPayable={
                listing.network !== null && listing.payToAddress !== null
              }
              kind="api"
              ref={listing.slug}
              visibility={listing.visibility}
            />
          </header>

          <DetailsForm listing={listing} />

          <EndpointsSection listing={listing} />

          <ToggleSection
            checked={policyEnabled}
            description={t("appDetail.policyLead")}
            id="policy-enabled"
            isSaving={isSavingPolicy}
            onToggle={(checked) =>
              dispatch(savePolicy(resource, { policyEnabled: checked }))
            }
            title={t("appDetail.tabs.policy")}
          >
            <PolicyForm resource={resource} />
          </ToggleSection>

          <ToggleSection
            checked={faqEnabled}
            description={t("appDetail.faq.lead")}
            id="faq-enabled"
            isSaving={isSavingPolicy}
            onToggle={(checked) =>
              dispatch(savePolicy(resource, { faqEnabled: checked }))
            }
            title={t("appDetail.faq.title")}
          >
            <FaqEditor resource={resource} />
          </ToggleSection>

          <SettingsSection
            description={t("appDetail.reviewsLead")}
            title={t("appDetail.tabs.reviews")}
          >
            <ReviewsPanel id={id} kind="listing" />
          </SettingsSection>

          <SettingsSection
            description={t("appDetail.reportsLead")}
            title={t("appDetail.tabs.reports")}
          >
            <ReportsPanel id={id} kind="listing" />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
