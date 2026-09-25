import { Button, Spinner, TabGroup, Tag } from "@4mica/ui";
import { fetchApiListings } from "@stores/apiListing/actions";
import {
  selectApiListings,
  selectHasLoadedApiListings,
} from "@stores/apiListing/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchTrust, resetTrust } from "@stores/trust/actions";
import {
  selectIsTrustPending,
  selectTrustSummary,
} from "@stores/trust/selector";
import { useTitle } from "ahooks";
import { ArrowLeft, ShieldAlert, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { IntegrationGuideLink } from "@/components/IntegrationGuideLink";
import { EndpointsEditor } from "../apps/EndpointsEditor";
import { DetailsForm } from "./DetailsForm";
import { PolicyForm } from "./PolicyForm";
import { ReportsPanel } from "./ReportsPanel";
import { ReviewsPanel } from "./ReviewsPanel";

export function AppDetail() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { id = "" } = useParams<{ id: string }>();

  const listings = useAppSelector(selectApiListings);
  const hasLoaded = useAppSelector(selectHasLoadedApiListings);
  const summary = useAppSelector(selectTrustSummary);
  const isLoadingTrust = useAppSelector(selectIsTrustPending("trust"));

  const [activeTab, setActiveTab] = useState("details");
  const [editingEndpoints, setEditingEndpoints] = useState(false);

  const listing = listings.find((row) => row.id === id) ?? null;

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

    dispatch(fetchTrust({ kind: "listing", id }));

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

  const tabs = [
    {
      id: "details",
      label: t("appDetail.tabs.details"),
      content: () => <DetailsForm listing={listing} />,
    },
    {
      id: "endpoints",
      label: `${t("appDetail.tabs.endpoints")} (${listing.endpoints.length})`,
      content: () => (
        <div className="flex flex-col items-start gap-3">
          <p className="text-ink-muted text-sm">
            {t("appDetail.endpointsLead")}
          </p>
          <Button
            intent="outline"
            onClick={() => setEditingEndpoints(true)}
            size="sm"
          >
            {t("appDetail.editEndpoints")}
          </Button>
        </div>
      ),
    },
    {
      id: "policy",
      label: t("appDetail.tabs.policy"),
      content: () => <PolicyForm id={id} kind="listing" />,
    },
    {
      id: "reviews",
      label: summary?.ratingCount
        ? `${t("appDetail.tabs.reviews")} (${summary.ratingCount})`
        : t("appDetail.tabs.reviews"),
      content: () => <ReviewsPanel id={id} kind="listing" />,
    },
    {
      id: "reports",
      label: summary?.openReports
        ? `${t("appDetail.tabs.reports")} (${summary.openReports})`
        : t("appDetail.tabs.reports"),
      content: () => <ReportsPanel id={id} kind="listing" />,
    },
  ];

  return (
    <div className="flex size-full min-h-0 flex-col">
      <div className="flex w-full flex-1 animate-fade-in flex-col overflow-y-auto pr-3 pb-10">
        <div className="mx-auto flex w-full flex-col gap-6 lg:max-w-3xl">
          <Button asChild className="self-start" intent="ghost" size="sm">
            <Link to="/apps">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t("appDetail.backToApps")}
            </Link>
          </Button>

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

          {isLoadingTrust && !summary ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <TabGroup
              activeTab={activeTab}
              contentClassName="pt-6"
              onTabChange={setActiveTab}
              tabs={tabs}
            />
          )}
        </div>
      </div>

      <EndpointsEditor
        listing={editingEndpoints ? listing : null}
        onClose={() => setEditingEndpoints(false)}
      />
    </div>
  );
}
