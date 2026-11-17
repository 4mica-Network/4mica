import {
  fetchCustomerDetail,
  resetCustomerDetail,
} from "@stores/customer/actions";
import {
  selectCustomerDetail,
  selectCustomerOverview,
  selectDetailCustomer,
  selectHasLoadedCustomerDetail,
} from "@stores/customer/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { BackBar } from "@/components/BackBar";
import { LoadFailure } from "@/components/LoadFailure";
import { PageSpinner } from "@/components/PageSpinner";
import { usePageTitle } from "@/hooks/usePageTitle";
import { AccessPanel } from "./AccessPanel";
import { ActivityPanel } from "./ActivityPanel";
import { CouponsPanel } from "./CouponsPanel";
import { CreditPanel } from "./CreditPanel";
import { DetailsForm } from "./DetailsForm";
import { IdentitiesPanel } from "./IdentitiesPanel";
import { LimitsPanel } from "./LimitsPanel";
import { OverviewTiles } from "./OverviewTiles";
import { PolicyPanel } from "./PolicyPanel";
import { RemovePanel } from "./RemovePanel";

export function CustomerDetail() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { id = "" } = useParams<{ id: string }>();

  const customer = useAppSelector(selectDetailCustomer);
  const overview = useAppSelector(selectCustomerOverview);
  const hasLoaded = useAppSelector(selectHasLoadedCustomerDetail);
  const { loadError, notFound } = useAppSelector(selectCustomerDetail);

  usePageTitle(
    customer
      ? `${customer.name} · ${t("customer.detail.title")}`
      : t("customer.detail.title"),
  );

  useEffect(() => {
    if (!id) {
      return;
    }

    dispatch(fetchCustomerDetail(id));

    return () => {
      dispatch(resetCustomerDetail());
    };
  }, [dispatch, id]);

  if (!hasLoaded && !customer) {
    return <PageSpinner />;
  }

  if (!customer) {
    return (
      <LoadFailure
        notFound={notFound || !loadError}
        notFoundLabel={t("customer.detail.notFound")}
        message={loadError}
        onRetry={() => id && dispatch(fetchCustomerDetail(id))}
        backTo="/customers"
        backLabel={t("customer.detail.back")}
      />
    );
  }

  return (
    <div className="flex w-full animate-fade-in flex-col pb-16">
      <BackBar label={t("customer.detail.back")} to="/customers" />

      <div className="mx-auto flex w-full flex-col gap-6 lg:max-w-3xl">
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
              {customer.name}
            </h1>
            {customer.description && (
              <p className="mt-1 text-ink-muted text-sm">
                {customer.description}
              </p>
            )}
          </div>

          <OverviewTiles overview={overview} />
        </div>

        <DetailsForm customer={customer} />

        <AccessPanel customer={customer} />

        <IdentitiesPanel customer={customer} />

        <PolicyPanel customer={customer} />

        <LimitsPanel customer={customer} overview={overview} />

        <CreditPanel customer={customer} />

        <CouponsPanel customer={customer} />

        <ActivityPanel customerId={customer.id} />

        <RemovePanel customer={customer} />
      </div>
    </div>
  );
}
