import { Button, Spinner } from "@4mica/ui";
import { fetchApiListings } from "@stores/apiListing/actions";
import {
  selectApiListings,
  selectHasLoadedApiListings,
} from "@stores/apiListing/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchTrust, resetTrust, savePolicy } from "@stores/trust/actions";
import { selectIsTrustPending, selectPolicy } from "@stores/trust/selector";
import { useTitle } from "ahooks";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { BackBar } from "@/components/BackBar";
import { SettingsSection } from "@/components/form";
import { DetailsForm } from "./DetailsForm";
import { FaqEditor } from "./FaqEditor";
import { PolicyForm } from "./PolicyForm";
import { ReportsPanel } from "./ReportsPanel";
import { ReviewsPanel } from "./ReviewsPanel";
import { SecretKeysSection } from "./SecretKeysSection";
import { ToggleSection } from "./ToggleSection";

export function ApiDetail() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { id = "" } = useParams<{ id: string }>();

  const listings = useAppSelector(selectApiListings);
  const hasLoaded = useAppSelector(selectHasLoadedApiListings);
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
          <Link to="/apis">{t("appDetail.backToApps")}</Link>
        </Button>
      </div>
    );
  }

  const policyEnabled = policy?.policyEnabled ?? true;
  const faqEnabled = policy?.faqEnabled ?? true;

  return (
    <div className="flex w-full animate-fade-in flex-col pb-16">
      <BackBar label={t("appDetail.backToApps")} to="/apis" />

      <div className="mx-auto flex w-full flex-col gap-10 lg:max-w-3xl">
        <DetailsForm listing={listing} />

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

        <SecretKeysSection resource={resource} />

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
  );
}
