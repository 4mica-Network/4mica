import { Tag } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import {
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
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { EditableCard } from "@/components/EditableCard";
import {
  FieldRow,
  Select,
  SettingsSection,
  TextArea,
  TextInput,
} from "@/components/form";
import { NETWORKS, shortenAddress } from "@/lib/networks";
import { VISIBILITY_OPTIONS } from "../apps/constants";
import {
  type ApiListingValues,
  blankToNull,
  editApiListingSchema,
  NAME_MAX_LENGTH,
  SUMMARY_MAX_LENGTH,
} from "../apps/validation";

const NO_WALLET = "__none__";

export function DetailsForm({ listing }: { listing: ApiListing }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(
    selectIsApiListingPending(`apiListing:${listing.id}`),
  );
  const error = useAppSelector(selectApiListingError);
  const issues = useAppSelector(selectApiListingIssues);
  const wallets = useAppSelector(selectSellerWallets);

  const {
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<ApiListingValues>({
    resolver: zodResolver(editApiListingSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      slug: "",
      summary: "",
      description: "",
      walletId: "",
      assetAddress: "",
      priceAmount: "",
      priceCurrency: "",
      priceLabel: "",
      baseUrl: "",
      docsUrl: "",
      x402Endpoint: "",
      category: "",
      tags: [],
      visibility: "PRIVATE",
    },
  });

  const values = watch();

  useEffect(() => {
    dispatch(clearApiListingIssues());
    dispatch(fetchActiveWallets());
    reset({
      name: listing.name,
      slug: listing.slug,
      summary: listing.summary ?? "",
      description: listing.description ?? "",
      walletId: listing.walletId ?? "",
      assetAddress: listing.assetAddress ?? "",
      priceAmount: listing.priceAmount ?? "",
      priceCurrency: listing.priceCurrency ?? "",
      priceLabel: listing.priceLabel ?? "",
      baseUrl: listing.baseUrl ?? "",
      docsUrl: listing.docsUrl ?? "",
      x402Endpoint: listing.x402Endpoint ?? "",
      category: listing.category ?? "",
      tags: listing.tags,
      visibility: listing.visibility,
    });
  }, [listing, reset, dispatch]);

  const fieldError = (field: keyof ApiListingValues) => {
    if (issues[field]) {
      return issues[field];
    }
    const message = errors[field]?.message;
    return message ? t(message) : undefined;
  };

  const walletOptions = [
    { value: NO_WALLET, title: t("apiListing.edit.noWallet") },
    ...wallets.map((wallet) => ({
      value: wallet.id,
      title: `${wallet.label} · ${NETWORKS[wallet.network].label}`,
    })),
  ];

  const chosenWallet = wallets.find((wallet) => wallet.id === values.walletId);

  const onValid = (data: ApiListingValues) => {
    dispatch(
      updateApiListing({
        id: listing.id,
        data: {
          name: data.name.trim(),
          slug: data.slug || undefined,
          summary: blankToNull(data.summary),
          description: blankToNull(data.description),
          baseUrl: blankToNull(data.baseUrl),
          docsUrl: blankToNull(data.docsUrl),
          x402Endpoint: blankToNull(data.x402Endpoint),
          category: blankToNull(data.category),
          tags: data.tags,
          visibility: data.visibility,
          walletId:
            data.walletId === NO_WALLET ? null : blankToNull(data.walletId),
          assetAddress: blankToNull(data.assetAddress),
          priceAmount: blankToNull(data.priceAmount),
          priceCurrency: blankToNull(data.priceCurrency),
          priceLabel: blankToNull(data.priceLabel),
        },
      }),
    );
  };

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        description={t("appDetail.details.description")}
        title={t("appDetail.details.title")}
      >
        <EditableCard
          isDirty={isDirty}
          isSaving={isSaving}
          onReset={() => reset()}
          onSave={() => onValid(values)}
        >
          <div className="flex flex-col divide-y divide-overlay/10">
            <FieldRow
              htmlFor="app-name"
              title={t("apiListing.create.fields.name.title")}
            >
              <TextInput
                error={fieldError("name")}
                id="app-name"
                maxLength={NAME_MAX_LENGTH}
                onChange={(value) =>
                  setValue("name", value, { shouldValidate: true })
                }
                value={values.name}
              />
            </FieldRow>

            <FieldRow
              htmlFor="app-summary"
              title={t("apiListing.create.fields.summary.title")}
            >
              <TextInput
                error={fieldError("summary")}
                id="app-summary"
                maxLength={SUMMARY_MAX_LENGTH}
                onChange={(value) =>
                  setValue("summary", value, { shouldValidate: true })
                }
                value={values.summary ?? ""}
              />
            </FieldRow>

            <FieldRow
              htmlFor="app-description"
              title={t("apiListing.create.fields.description.title")}
            >
              <TextArea
                error={fieldError("description")}
                id="app-description"
                onChange={(value) =>
                  setValue("description", value, { shouldValidate: true })
                }
                rows={4}
                value={values.description ?? ""}
              />
            </FieldRow>

            <FieldRow
              htmlFor="app-category"
              title={t("apiListing.create.fields.category.title")}
            >
              <TextInput
                error={fieldError("category")}
                id="app-category"
                onChange={(value) =>
                  setValue("category", value, { shouldValidate: true })
                }
                value={values.category ?? ""}
              />
            </FieldRow>
          </div>
        </EditableCard>
      </SettingsSection>

      <SettingsSection
        description={t("appDetail.payment.description")}
        title={t("appDetail.payment.title")}
      >
        <EditableCard
          isDirty={isDirty}
          isSaving={isSaving}
          onReset={() => reset()}
          onSave={() => onValid(values)}
        >
          <div className="flex flex-col divide-y divide-overlay/10">
            <FieldRow
              description={t("apiListing.create.fields.wallet.description")}
              htmlFor="app-wallet"
              title={t("apiListing.create.fields.wallet.title")}
            >
              <Select
                error={fieldError("walletId")}
                id="app-wallet"
                onChange={(value) =>
                  setValue("walletId", value === NO_WALLET ? "" : value, {
                    shouldValidate: true,
                  })
                }
                options={walletOptions}
                value={values.walletId || NO_WALLET}
              />
              {chosenWallet && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Tag size="sm" variant="neutral">
                    {NETWORKS[chosenWallet.network].label}
                  </Tag>
                  <Tag className="font-mono" size="sm" variant="neutral">
                    {shortenAddress(chosenWallet.address)}
                  </Tag>
                </div>
              )}
            </FieldRow>

            <FieldRow
              htmlFor="app-price"
              title={t("apiListing.create.fields.price.title")}
            >
              <div className="flex gap-2">
                <div className="flex-1">
                  <TextInput
                    error={fieldError("priceAmount")}
                    id="app-price"
                    onChange={(value) =>
                      setValue("priceAmount", value, { shouldValidate: true })
                    }
                    placeholder="0.01"
                    value={values.priceAmount ?? ""}
                  />
                </div>
                <div className="w-28">
                  <TextInput
                    error={fieldError("priceCurrency")}
                    format="uppercase"
                    id="app-currency"
                    maxLength={16}
                    onChange={(value) =>
                      setValue("priceCurrency", value, { shouldValidate: true })
                    }
                    placeholder="USD"
                    value={values.priceCurrency ?? ""}
                  />
                </div>
              </div>
            </FieldRow>

            <FieldRow
              htmlFor="app-asset"
              title={t("apiListing.create.fields.asset.title")}
            >
              <TextInput
                error={fieldError("assetAddress")}
                id="app-asset"
                onChange={(value) =>
                  setValue("assetAddress", value, { shouldValidate: true })
                }
                value={values.assetAddress ?? ""}
              />
            </FieldRow>

            <FieldRow
              htmlFor="app-base-url"
              title={t("apiListing.create.fields.baseUrl.title")}
            >
              <TextInput
                error={fieldError("baseUrl")}
                id="app-base-url"
                onChange={(value) =>
                  setValue("baseUrl", value, { shouldValidate: true })
                }
                value={values.baseUrl ?? ""}
              />
            </FieldRow>

            <FieldRow
              htmlFor="app-docs-url"
              title={t("apiListing.create.fields.docsUrl.title")}
            >
              <TextInput
                error={fieldError("docsUrl")}
                id="app-docs-url"
                onChange={(value) =>
                  setValue("docsUrl", value, { shouldValidate: true })
                }
                value={values.docsUrl ?? ""}
              />
            </FieldRow>
          </div>
        </EditableCard>
      </SettingsSection>

      <SettingsSection
        description={t("appDetail.visibility.description")}
        title={t("appDetail.visibility.title")}
      >
        <EditableCard
          isDirty={isDirty}
          isSaving={isSaving}
          onReset={() => reset()}
          onSave={() => onValid(values)}
        >
          <FieldRow
            htmlFor="app-visibility"
            title={t("apiListing.create.fields.visibility.title")}
          >
            <Select
              error={fieldError("visibility")}
              id="app-visibility"
              onChange={(value) =>
                setValue(
                  "visibility",
                  value as ApiListingValues["visibility"],
                  { shouldValidate: true },
                )
              }
              options={VISIBILITY_OPTIONS.map((option) => ({
                value: option.value,
                title: t(option.labelKey),
              }))}
              value={values.visibility}
            />
          </FieldRow>
        </EditableCard>
      </SettingsSection>

      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}
