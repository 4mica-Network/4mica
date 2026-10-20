import { PAYMENT_NETWORKS, shortenAddress } from "@4mica/rules";
import { Tag } from "@4mica/ui";
import type { ApiListingInput } from "@api/apiListing";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  apiListingPendingKeys,
  clearApiListingIssues,
  updateApiListing,
} from "@stores/apiListing/actions";
import {
  selectApiListingError,
  selectApiListingIssues,
  selectIsApiListingPending,
} from "@stores/apiListing/selector";
import type { ApiListing } from "@stores/apiListing/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchActiveWallets } from "@stores/wallet/actions";
import { selectSellerWallets } from "@stores/wallet/selector";
import { blankToNull } from "@utils/format";
import { type ReactNode, useEffect, useMemo } from "react";
import {
  FormProvider,
  type Resolver,
  useForm,
  useWatch,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { EditableCard } from "@/components/EditableCard";
import {
  FieldRow,
  FormSelect,
  FormTextArea,
  FormTextInput,
} from "@/components/form";
import { SettingsSection } from "@/components/layout";
import { useServerIssues } from "@/hooks/useServerIssues";
import { HTTP_METHOD_OPTIONS, VISIBILITY_OPTIONS } from "../apis/constants";
import {
  type ApiListingValues,
  createApiListingSchema,
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  SUMMARY_MAX_LENGTH,
} from "../apis/validation";

type EditableField = keyof ApiListingValues & keyof ApiListingInput;

const DETAILS_FIELDS = [
  "name",
  "summary",
  "description",
  "category",
] as const satisfies readonly EditableField[];

const PAYMENT_FIELDS = [
  "walletId",
  "priceAmount",
  "priceCurrency",
  "assetAddress",
  "method",
  "url",
  "docsUrl",
] as const satisfies readonly EditableField[];

const VISIBILITY_FIELDS = [
  "visibility",
] as const satisfies readonly EditableField[];

const toFormValue = (listing: ApiListing, field: EditableField) =>
  listing[field] ?? "";

const toPatchValue = (field: EditableField, value: unknown) => {
  if (field === "method" || field === "visibility") {
    return value;
  }
  if (field === "name") {
    return String(value).trim();
  }
  return blankToNull(value as string | undefined);
};

function ListingCard({
  listing,
  fields,
  title,
  description,
  children,
}: {
  listing: ApiListing;
  fields: readonly EditableField[];
  title: string;
  description: string;
  children: ReactNode;
}) {
  const dispatch = useAppDispatch();
  const isSaving = useAppSelector(
    selectIsApiListingPending(apiListingPendingKeys.row(listing.id)),
  );
  const allIssues = useAppSelector(selectApiListingIssues);

  const resolver = useMemo(
    () =>
      zodResolver(
        createApiListingSchema.pick(
          Object.fromEntries(fields.map((field) => [field, true])) as Record<
            EditableField,
            true
          >,
        ),
      ) as Resolver<Partial<ApiListingValues>>,
    [fields],
  );

  const values = useMemo(
    () =>
      Object.fromEntries(
        fields.map((field) => [field, toFormValue(listing, field)]),
      ) as Partial<ApiListingValues>,
    [listing, fields],
  );

  const issues = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(allIssues).filter(([field]) =>
          fields.includes(field as EditableField),
        ),
      ),
    [allIssues, fields],
  );

  const form = useForm<Partial<ApiListingValues>>({
    resolver,
    mode: "onTouched",
    values,
  });
  const {
    handleSubmit,
    reset,
    setError,
    formState: { isDirty, dirtyFields },
  } = form;
  useServerIssues(issues, setError);

  const save = (data: Partial<ApiListingValues>) => {
    const changed = Object.fromEntries(
      fields
        .filter((field) => dirtyFields[field])
        .map((field) => [field, toPatchValue(field, data[field])]),
    );
    dispatch(updateApiListing({ id: listing.id, data: changed }));
  };

  return (
    <SettingsSection title={title} description={description}>
      <FormProvider {...form}>
        <EditableCard
          isDirty={isDirty}
          isSaving={isSaving}
          onReset={() => reset()}
          onSave={handleSubmit(save)}
        >
          {children}
        </EditableCard>
      </FormProvider>
    </SettingsSection>
  );
}

function WalletField() {
  const { t } = useTranslation();
  const wallets = useAppSelector(selectSellerWallets);
  const walletId = useWatch({ name: "walletId" }) as string | undefined;
  const chosenWallet = wallets.find((wallet) => wallet.id === walletId);

  return (
    <FieldRow
      description={t("apiListing.create.fields.wallet.description")}
      htmlFor="app-wallet"
      title={t("apiListing.create.fields.wallet.title")}
    >
      <FormSelect
        name="walletId"
        options={[
          { value: "", title: t("apiListing.edit.noWallet") },
          ...wallets.map((wallet) => ({
            value: wallet.id,
            title: `${wallet.label} · ${PAYMENT_NETWORKS[wallet.network].label}`,
          })),
        ]}
      />
      {chosenWallet && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Tag size="sm" variant="neutral">
            {PAYMENT_NETWORKS[chosenWallet.network].label}
          </Tag>
          <Tag className="font-mono" size="sm" variant="neutral">
            {shortenAddress(chosenWallet.address)}
          </Tag>
        </div>
      )}
    </FieldRow>
  );
}

export function DetailsForm({ listing }: { listing: ApiListing }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const error = useAppSelector(selectApiListingError);

  useEffect(() => {
    dispatch(clearApiListingIssues());
    dispatch(fetchActiveWallets());
  }, [listing.id, dispatch]);

  return (
    <div className="flex flex-col gap-10">
      <ListingCard
        listing={listing}
        fields={DETAILS_FIELDS}
        title={t("appDetail.details.title")}
        description={t("appDetail.details.description")}
      >
        <div className="flex flex-col divide-y divide-overlay/10">
          <FieldRow
            htmlFor="app-name"
            title={t("apiListing.create.fields.name.title")}
            required
          >
            <FormTextInput name="name" maxLength={NAME_MAX_LENGTH} />
          </FieldRow>

          <FieldRow
            htmlFor="app-summary"
            title={t("apiListing.create.fields.summary.title")}
          >
            <FormTextInput
              name="summary"
              maxLength={SUMMARY_MAX_LENGTH}
              spellCheck
            />
          </FieldRow>

          <FieldRow
            htmlFor="app-description"
            title={t("apiListing.create.fields.description.title")}
          >
            <FormTextArea
              name="description"
              maxLength={DESCRIPTION_MAX_LENGTH}
              rows={4}
            />
          </FieldRow>

          <FieldRow
            htmlFor="app-category"
            title={t("apiListing.create.fields.category.title")}
          >
            <FormTextInput name="category" maxLength={64} />
          </FieldRow>
        </div>
      </ListingCard>

      <ListingCard
        listing={listing}
        fields={PAYMENT_FIELDS}
        title={t("appDetail.payment.title")}
        description={t("appDetail.payment.description")}
      >
        <div className="flex flex-col divide-y divide-overlay/10">
          <WalletField />

          <FieldRow
            htmlFor="app-price"
            title={t("apiListing.create.fields.price.title")}
          >
            <div className="flex gap-2">
              <div className="flex-1">
                <FormTextInput
                  name="priceAmount"
                  inputMode="decimal"
                  placeholder="0.01"
                />
              </div>
              <div className="w-28">
                <FormTextInput
                  id="app-currency"
                  name="priceCurrency"
                  aria-label={t("form.currency")}
                  format="uppercase"
                  maxLength={16}
                  placeholder="USD"
                />
              </div>
            </div>
          </FieldRow>

          <FieldRow
            htmlFor="app-asset"
            title={t("apiListing.create.fields.asset.title")}
          >
            <FormTextInput name="assetAddress" placeholder="0x…" />
          </FieldRow>

          <FieldRow
            htmlFor="app-method"
            title={t("apiListing.create.fields.method.title")}
          >
            <FormSelect name="method" options={HTTP_METHOD_OPTIONS} />
          </FieldRow>

          <FieldRow
            htmlFor="app-url"
            title={t("apiListing.create.fields.url.title")}
          >
            <FormTextInput
              name="url"
              type="url"
              inputMode="url"
              placeholder="https://api.example.com/v1/limits"
            />
          </FieldRow>

          <FieldRow
            htmlFor="app-docs-url"
            title={t("apiListing.create.fields.docsUrl.title")}
          >
            <FormTextInput name="docsUrl" type="url" inputMode="url" />
          </FieldRow>
        </div>
      </ListingCard>

      <ListingCard
        listing={listing}
        fields={VISIBILITY_FIELDS}
        title={t("appDetail.visibility.title")}
        description={t("appDetail.visibility.description")}
      >
        <FieldRow
          htmlFor="app-visibility"
          title={t("apiListing.create.fields.visibility.title")}
        >
          <FormSelect
            name="visibility"
            options={VISIBILITY_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.labelKey),
            }))}
          />
        </FieldRow>
      </ListingCard>

      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
