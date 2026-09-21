import { Button, Modal, Spinner, Tag } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { createApiListing } from "@stores/apiListing/actions";
import {
  selectApiListingError,
  selectApiListingIssues,
  selectIsApiListingPending,
} from "@stores/apiListing/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchActiveWallets } from "@stores/wallet/actions";
import { selectSellerWallets } from "@stores/wallet/selector";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextArea, TextInput } from "@/components/form";
import { StepIndicator } from "@/components/Onboarding/StepIndicator";
import { links } from "@/lib/links";
import { NETWORKS, shortenAddress } from "@/lib/networks";
import { CATEGORY_SUGGESTIONS, VISIBILITY_OPTIONS } from "./constants";
import {
  type ApiListingValues,
  blankToNull,
  CREATE_STEP_FIELDS,
  createApiListingSchema,
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  SUMMARY_MAX_LENGTH,
} from "./validation";

const PENDING_KEY = "createApiListing";
const TOTAL_STEPS = CREATE_STEP_FIELDS.length;

const slugify = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

export function CreateApiListingModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(selectIsApiListingPending(PENDING_KEY));
  const error = useAppSelector(selectApiListingError);
  const issues = useAppSelector(selectApiListingIssues);
  const wallets = useAppSelector(selectSellerWallets);

  const [step, setStep] = useState(0);
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagText, setTagText] = useState("");

  const {
    handleSubmit,
    setValue,
    watch,
    trigger,
    reset,
    formState: { errors },
  } = useForm<ApiListingValues>({
    resolver: zodResolver(createApiListingSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      slug: "",
      summary: "",
      description: "",
      walletId: "",
      assetAddress: "",
      priceAmount: "",
      priceCurrency: "USD",
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
    if (!isOpen) {
      return;
    }
    reset();
    setStep(0);
    setSlugTouched(false);
    setTagText("");
    dispatch(fetchActiveWallets());
  }, [isOpen, reset, dispatch]);

  const walletOptions = wallets.map((wallet) => ({
    value: wallet.id,
    title: `${wallet.label} · ${NETWORKS[wallet.network].label}`,
  }));

  const chosenWallet = wallets.find((wallet) => wallet.id === values.walletId);

  const continueToNext = async () => {
    const valid = await trigger([...CREATE_STEP_FIELDS[step]]);
    if (!valid) {
      return;
    }
    setStep((current) => current + 1);
  };

  const onValid = (data: ApiListingValues) => {
    dispatch(
      createApiListing({
        name: data.name.trim(),
        ...(blankToNull(data.slug) ? { slug: data.slug as string } : {}),
        summary: blankToNull(data.summary),
        description: blankToNull(data.description),
        baseUrl: blankToNull(data.baseUrl),
        docsUrl: blankToNull(data.docsUrl),
        x402Endpoint: blankToNull(data.x402Endpoint),
        category: blankToNull(data.category),
        tags: data.tags,
        visibility: data.visibility,
        walletId: blankToNull(data.walletId),
        assetAddress: blankToNull(data.assetAddress),
        priceAmount: blankToNull(data.priceAmount),
        priceCurrency: blankToNull(data.priceCurrency),
        priceLabel: blankToNull(data.priceLabel),
      }),
    );
  };

  const onInvalid = (invalid: Record<string, unknown>) => {
    const firstBadStep = CREATE_STEP_FIELDS.findIndex((fields) =>
      fields.some((field) => field in invalid),
    );
    if (firstBadStep >= 0 && firstBadStep !== step) {
      setStep(firstBadStep);
    }
  };

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

  const addTag = () => {
    const tag = tagText.trim().toLowerCase();
    if (!tag || values.tags.includes(tag) || values.tags.length >= 10) {
      setTagText("");
      return;
    }
    setValue("tags", [...values.tags, tag], { shouldValidate: true });
    setTagText("");
  };

  const previewSlug = values.slug || slugify(values.name) || "your-api";
  const isLastStep = step === TOTAL_STEPS - 1;
  const canSubmit = Boolean(values.name?.trim()) && !isSaving;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("apiListing.create.title")}
      description={t("apiListing.create.description")}
      size="lg"
      disableOverlayClose
      data-testid="create-api-listing"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <a
            href={links.docs}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 rounded-md text-ink-subtle text-xs transition-colors hover:text-ink-body"
          >
            {t("apiListing.create.learnMore")}
            <ArrowUpRight className="h-3 w-3" />
          </a>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                intent="ghost"
                size="sm"
                disabled={isSaving}
                onClick={() => setStep((current) => current - 1)}
              >
                {t("apiListing.create.back")}
              </Button>
            )}

            {isLastStep ? (
              <Button
                intent="invert"
                size="sm"
                className="btn-no-lift min-w-32"
                disabled={!canSubmit}
                onClick={handleSubmit(onValid, onInvalid)}
                data-testid="create-api-listing-submit"
              >
                <span className="flex w-full items-center justify-center text-sm">
                  {isSaving ? (
                    <Spinner size="sm" />
                  ) : (
                    t("apiListing.create.finish")
                  )}
                </span>
              </Button>
            ) : (
              <Button
                intent="invert"
                size="sm"
                className="btn-no-lift min-w-32"
                onClick={continueToNext}
                data-testid="create-api-listing-continue"
              >
                <span className="flex w-full items-center justify-center text-sm">
                  {t("apiListing.create.continue")}
                </span>
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <StepIndicator current={step} total={TOTAL_STEPS} />

        {step === 0 && (
          <div className="flex flex-col divide-y divide-overlay/10">
            <FieldRow
              title={t("apiListing.create.fields.name.title")}
              description={t("apiListing.create.fields.name.description")}
              htmlFor="api-listing-name"
            >
              <TextInput
                id="api-listing-name"
                value={values.name}
                maxLength={NAME_MAX_LENGTH}
                placeholder={t("apiListing.create.fields.name.placeholder")}
                error={fieldError("name")}
                autoFocus
                onChange={(value) => {
                  setValue("name", value, { shouldValidate: true });
                  if (!slugTouched) {
                    setValue("slug", slugify(value));
                  }
                }}
              />
            </FieldRow>

            <FieldRow
              title={t("apiListing.create.fields.slug.title")}
              description={t("apiListing.create.fields.slug.description", {
                url: `${links.website}/…/api/${previewSlug}`,
              })}
              htmlFor="api-listing-slug"
            >
              <TextInput
                id="api-listing-slug"
                value={values.slug ?? ""}
                format="lowercase"
                maxLength={64}
                placeholder={slugify(values.name) || "your-api"}
                error={fieldError("slug")}
                onChange={(value) => {
                  setSlugTouched(true);
                  setValue("slug", value, { shouldValidate: true });
                }}
              />
            </FieldRow>

            <FieldRow
              title={t("apiListing.create.fields.summary.title")}
              description={t("apiListing.create.fields.summary.description")}
              htmlFor="api-listing-summary"
            >
              <TextInput
                id="api-listing-summary"
                value={values.summary ?? ""}
                maxLength={SUMMARY_MAX_LENGTH}
                placeholder={t("apiListing.create.fields.summary.placeholder")}
                error={fieldError("summary")}
                onChange={(value) =>
                  setValue("summary", value, { shouldValidate: true })
                }
              />
            </FieldRow>

            <FieldRow
              title={t("apiListing.create.fields.description.title")}
              description={t(
                "apiListing.create.fields.description.description",
              )}
              htmlFor="api-listing-description"
            >
              <TextArea
                id="api-listing-description"
                rows={4}
                value={values.description ?? ""}
                maxLength={DESCRIPTION_MAX_LENGTH}
                error={fieldError("description")}
                onChange={(value) =>
                  setValue("description", value, { shouldValidate: true })
                }
              />
            </FieldRow>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col divide-y divide-overlay/10">
            <FieldRow
              title={t("apiListing.create.fields.wallet.title")}
              description={t("apiListing.create.fields.wallet.description")}
              htmlFor="api-listing-wallet"
            >
              {walletOptions.length === 0 ? (
                <p className="text-ink-muted text-sm">
                  {t("apiListing.create.fields.wallet.none")}
                </p>
              ) : (
                <Select
                  id="api-listing-wallet"
                  value={values.walletId ?? ""}
                  options={walletOptions}
                  placeholder={t("apiListing.create.fields.wallet.placeholder")}
                  error={fieldError("walletId")}
                  onChange={(value) =>
                    setValue("walletId", value, { shouldValidate: true })
                  }
                />
              )}

              {/* Show what choosing this wallet actually commits to. The two
                  values are derived server-side, so they are not editable. */}
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
              description={t("apiListing.create.fields.price.description")}
              htmlFor="api-listing-price"
            >
              <div className="flex gap-2">
                <div className="flex-1">
                  <TextInput
                    id="api-listing-price"
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
                    id="api-listing-currency"
                    value={values.priceCurrency ?? ""}
                    format="uppercase"
                    maxLength={16}
                    placeholder="USD"
                    error={fieldError("priceCurrency")}
                    onChange={(value) =>
                      setValue("priceCurrency", value, {
                        shouldValidate: true,
                      })
                    }
                  />
                </div>
              </div>
            </FieldRow>

            <FieldRow
              title={t("apiListing.create.fields.asset.title")}
              description={t("apiListing.create.fields.asset.description")}
              htmlFor="api-listing-asset"
            >
              <TextInput
                id="api-listing-asset"
                value={values.assetAddress ?? ""}
                placeholder={t("apiListing.create.fields.asset.placeholder")}
                error={fieldError("assetAddress")}
                onChange={(value) =>
                  setValue("assetAddress", value, { shouldValidate: true })
                }
              />
            </FieldRow>

            <FieldRow
              title={t("apiListing.create.fields.priceLabel.title")}
              description={t("apiListing.create.fields.priceLabel.description")}
              htmlFor="api-listing-price-label"
            >
              <TextInput
                id="api-listing-price-label"
                value={values.priceLabel ?? ""}
                maxLength={64}
                placeholder={t(
                  "apiListing.create.fields.priceLabel.placeholder",
                )}
                error={fieldError("priceLabel")}
                onChange={(value) =>
                  setValue("priceLabel", value, { shouldValidate: true })
                }
              />
            </FieldRow>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col divide-y divide-overlay/10">
            <FieldRow
              title={t("apiListing.create.fields.baseUrl.title")}
              description={t("apiListing.create.fields.baseUrl.description")}
              htmlFor="api-listing-base-url"
            >
              <TextInput
                id="api-listing-base-url"
                value={values.baseUrl ?? ""}
                placeholder="https://api.example.com/v1"
                error={fieldError("baseUrl")}
                onChange={(value) =>
                  setValue("baseUrl", value, { shouldValidate: true })
                }
              />
            </FieldRow>

            <FieldRow
              title={t("apiListing.create.fields.docsUrl.title")}
              description={t("apiListing.create.fields.docsUrl.description")}
              htmlFor="api-listing-docs-url"
            >
              <TextInput
                id="api-listing-docs-url"
                value={values.docsUrl ?? ""}
                placeholder="https://docs.example.com/api"
                error={fieldError("docsUrl")}
                onChange={(value) =>
                  setValue("docsUrl", value, { shouldValidate: true })
                }
              />
            </FieldRow>

            <FieldRow
              title={t("apiListing.create.fields.category.title")}
              description={t("apiListing.create.fields.category.description")}
              htmlFor="api-listing-category"
            >
              <TextInput
                id="api-listing-category"
                value={values.category ?? ""}
                maxLength={64}
                placeholder={CATEGORY_SUGGESTIONS.join(", ")}
                error={fieldError("category")}
                onChange={(value) =>
                  setValue("category", value, { shouldValidate: true })
                }
              />
            </FieldRow>

            <FieldRow
              title={t("apiListing.create.fields.tags.title")}
              description={t("apiListing.create.fields.tags.description")}
              htmlFor="api-listing-tags"
            >
              <TextInput
                id="api-listing-tags"
                value={tagText}
                maxLength={32}
                placeholder={t("apiListing.create.fields.tags.placeholder")}
                error={fieldError("tags")}
                onChange={setTagText}
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {values.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setValue(
                        "tags",
                        values.tags.filter((current) => current !== tag),
                        { shouldValidate: true },
                      )
                    }
                  >
                    <Tag size="sm" variant="neutral">
                      {tag} ×
                    </Tag>
                  </button>
                ))}
                {tagText.trim() && (
                  <Button
                    type="button"
                    intent="ghost"
                    size="sm"
                    className="btn-no-lift"
                    onClick={addTag}
                  >
                    {t("apiListing.create.fields.tags.add")}
                  </Button>
                )}
              </div>
            </FieldRow>

            <FieldRow
              title={t("apiListing.create.fields.visibility.title")}
              description={t("apiListing.create.fields.visibility.description")}
              htmlFor="api-listing-visibility"
            >
              <Select
                id="api-listing-visibility"
                value={values.visibility}
                options={VISIBILITY_OPTIONS.map((option) => ({
                  value: option.value,
                  title: t(option.labelKey),
                }))}
                error={fieldError("visibility")}
                onChange={(value) =>
                  setValue(
                    "visibility",
                    value as ApiListingValues["visibility"],
                    { shouldValidate: true },
                  )
                }
              />
            </FieldRow>
          </div>
        )}

        {error && <p className="text-danger text-sm">{error}</p>}
      </div>
    </Modal>
  );
}
