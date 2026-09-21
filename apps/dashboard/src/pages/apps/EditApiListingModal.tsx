import { Button, Modal, Spinner, Tag } from "@4mica/ui";
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
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextArea, TextInput } from "@/components/form";
import { NETWORKS, shortenAddress } from "@/lib/networks";
import { VISIBILITY_OPTIONS } from "./constants";
import {
  type ApiListingValues,
  blankToNull,
  editApiListingSchema,
  NAME_MAX_LENGTH,
  SUMMARY_MAX_LENGTH,
} from "./validation";

const NO_WALLET = "__none__";

export function EditApiListingModal({
  listing,
  onClose,
}: {
  listing: ApiListing | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const pendingKey = listing ? `apiListing:${listing.id}` : "";
  const isSaving = useAppSelector(selectIsApiListingPending(pendingKey));
  const error = useAppSelector(selectApiListingError);
  const issues = useAppSelector(selectApiListingIssues);
  const wallets = useAppSelector(selectSellerWallets);

  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
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
    if (!listing) {
      return;
    }
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

  const sawSaving = useRef(false);
  useEffect(() => {
    if (isSaving) {
      sawSaving.current = true;
      return;
    }
    if (!sawSaving.current) {
      return;
    }
    sawSaving.current = false;
    if (!error && Object.keys(issues).length === 0) {
      onClose();
    }
  }, [isSaving, error, issues, onClose]);

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
    if (!listing) {
      return;
    }
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
    <Modal
      isOpen={Boolean(listing)}
      onClose={onClose}
      title={t("apiListing.edit.title")}
      description={t("apiListing.edit.description")}
      size="lg"
      data-testid="edit-api-listing"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            intent="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("apiListing.edit.cancel")}
          </Button>
          <Button
            intent="invert"
            size="sm"
            className="btn-no-lift min-w-24"
            disabled={isSaving}
            onClick={handleSubmit(onValid)}
            data-testid="edit-api-listing-submit"
          >
            <span className="flex w-full items-center justify-center text-sm">
              {isSaving ? <Spinner size="sm" /> : t("apiListing.edit.save")}
            </span>
          </Button>
        </div>
      }
    >
      <div className="flex flex-col divide-y divide-overlay/10">
        <FieldRow
          title={t("apiListing.create.fields.name.title")}
          htmlFor="edit-api-listing-name"
        >
          <TextInput
            id="edit-api-listing-name"
            value={values.name}
            maxLength={NAME_MAX_LENGTH}
            error={fieldError("name")}
            onChange={(value) =>
              setValue("name", value, { shouldValidate: true })
            }
          />
        </FieldRow>

        <FieldRow
          title={t("apiListing.create.fields.summary.title")}
          htmlFor="edit-api-listing-summary"
        >
          <TextInput
            id="edit-api-listing-summary"
            value={values.summary ?? ""}
            maxLength={SUMMARY_MAX_LENGTH}
            error={fieldError("summary")}
            onChange={(value) =>
              setValue("summary", value, { shouldValidate: true })
            }
          />
        </FieldRow>

        <FieldRow
          title={t("apiListing.create.fields.description.title")}
          htmlFor="edit-api-listing-description"
        >
          <TextArea
            id="edit-api-listing-description"
            rows={4}
            value={values.description ?? ""}
            error={fieldError("description")}
            onChange={(value) =>
              setValue("description", value, { shouldValidate: true })
            }
          />
        </FieldRow>

        <FieldRow
          title={t("apiListing.create.fields.wallet.title")}
          description={t("apiListing.create.fields.wallet.description")}
          htmlFor="edit-api-listing-wallet"
        >
          <Select
            id="edit-api-listing-wallet"
            value={values.walletId || NO_WALLET}
            options={walletOptions}
            error={fieldError("walletId")}
            onChange={(value) =>
              setValue("walletId", value === NO_WALLET ? "" : value, {
                shouldValidate: true,
              })
            }
          />
          {chosenWallet && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Tag size="sm" variant="neutral">
                {NETWORKS[chosenWallet.network].label}
              </Tag>
              <Tag size="sm" variant="neutral" className="font-mono">
                {shortenAddress(chosenWallet.address)}
              </Tag>
            </div>
          )}
        </FieldRow>

        <FieldRow
          title={t("apiListing.create.fields.price.title")}
          htmlFor="edit-api-listing-price"
        >
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput
                id="edit-api-listing-price"
                value={values.priceAmount ?? ""}
                placeholder="0.01"
                error={fieldError("priceAmount")}
                onChange={(value) =>
                  setValue("priceAmount", value, { shouldValidate: true })
                }
              />
            </div>
            <div className="w-28">
              <TextInput
                id="edit-api-listing-currency"
                value={values.priceCurrency ?? ""}
                format="uppercase"
                maxLength={16}
                placeholder="USD"
                error={fieldError("priceCurrency")}
                onChange={(value) =>
                  setValue("priceCurrency", value, { shouldValidate: true })
                }
              />
            </div>
          </div>
        </FieldRow>

        <FieldRow
          title={t("apiListing.create.fields.asset.title")}
          htmlFor="edit-api-listing-asset"
        >
          <TextInput
            id="edit-api-listing-asset"
            value={values.assetAddress ?? ""}
            error={fieldError("assetAddress")}
            onChange={(value) =>
              setValue("assetAddress", value, { shouldValidate: true })
            }
          />
        </FieldRow>

        <FieldRow
          title={t("apiListing.create.fields.baseUrl.title")}
          htmlFor="edit-api-listing-base-url"
        >
          <TextInput
            id="edit-api-listing-base-url"
            value={values.baseUrl ?? ""}
            error={fieldError("baseUrl")}
            onChange={(value) =>
              setValue("baseUrl", value, { shouldValidate: true })
            }
          />
        </FieldRow>

        <FieldRow
          title={t("apiListing.create.fields.visibility.title")}
          htmlFor="edit-api-listing-visibility"
        >
          <Select
            id="edit-api-listing-visibility"
            value={values.visibility}
            options={VISIBILITY_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.labelKey),
            }))}
            error={fieldError("visibility")}
            onChange={(value) =>
              setValue("visibility", value as ApiListingValues["visibility"], {
                shouldValidate: true,
              })
            }
          />
        </FieldRow>

        {error && <p className="pt-3 text-danger text-sm">{error}</p>}
      </div>
    </Modal>
  );
}
