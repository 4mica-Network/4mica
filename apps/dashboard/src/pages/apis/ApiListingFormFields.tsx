import {
  PAYMENT_NETWORKS,
  SLUG_MAX_LENGTH,
  shortenAddress,
  slugify,
} from "@4mica/rules";
import { Button, Tag } from "@4mica/ui";
import type { Wallet } from "@stores/wallet/type";
import { X } from "lucide-react";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  FieldRow,
  FormSelect,
  FormTextArea,
  FormTextInput,
  TextInput,
} from "@/components/form";
import { links } from "@/lib/links";
import {
  CATEGORY_SUGGESTIONS,
  HTTP_METHOD_OPTIONS,
  VISIBILITY_OPTIONS,
} from "./constants";
import {
  type ApiListingValues,
  DESCRIPTION_MAX_LENGTH,
  MAX_TAGS,
  NAME_MAX_LENGTH,
  SUMMARY_MAX_LENGTH,
} from "./validation";

function DetailsStep() {
  const { t } = useTranslation();
  const [name, slug] = useWatch<ApiListingValues, ["name", "slug"]>({
    name: ["name", "slug"],
  });
  const previewSlug = slug || slugify(name) || "your-api";

  return (
    <>
      <FieldRow
        title={t("apiListing.create.fields.name.title")}
        description={t("apiListing.create.fields.name.description")}
        htmlFor="api-listing-name"
        required
      >
        <FormTextInput
          name="name"
          maxLength={NAME_MAX_LENGTH}
          placeholder={t("apiListing.create.fields.name.placeholder")}
          autoFocus
        />
      </FieldRow>

      <FieldRow
        title={t("apiListing.create.fields.slug.title")}
        description={t("apiListing.create.fields.slug.description", {
          url: `${links.website}/…/api/${previewSlug}`,
        })}
        htmlFor="api-listing-slug"
      >
        <FormTextInput
          name="slug"
          format="lowercase"
          maxLength={SLUG_MAX_LENGTH}
          placeholder={slugify(name) || "your-api"}
        />
      </FieldRow>

      <FieldRow
        title={t("apiListing.create.fields.summary.title")}
        description={t("apiListing.create.fields.summary.description")}
        htmlFor="api-listing-summary"
      >
        <FormTextInput
          name="summary"
          maxLength={SUMMARY_MAX_LENGTH}
          placeholder={t("apiListing.create.fields.summary.placeholder")}
          spellCheck
        />
      </FieldRow>

      <FieldRow
        title={t("apiListing.create.fields.description.title")}
        description={t("apiListing.create.fields.description.description")}
        htmlFor="api-listing-description"
      >
        <FormTextArea
          name="description"
          rows={4}
          maxLength={DESCRIPTION_MAX_LENGTH}
        />
      </FieldRow>
    </>
  );
}

function PaymentStep({ wallets }: { wallets: Wallet[] }) {
  const { t } = useTranslation();
  const walletId = useWatch<ApiListingValues, "walletId">({ name: "walletId" });
  const chosenWallet = wallets.find((wallet) => wallet.id === walletId);

  return (
    <>
      <FieldRow
        title={t("apiListing.create.fields.wallet.title")}
        description={t("apiListing.create.fields.wallet.description")}
        htmlFor="api-listing-wallet"
      >
        {wallets.length === 0 ? (
          <p className="text-ink-muted text-sm">
            {t("apiListing.create.fields.wallet.none")}
          </p>
        ) : (
          <FormSelect
            name="walletId"
            options={wallets.map((wallet) => ({
              value: wallet.id,
              title: `${wallet.label} · ${PAYMENT_NETWORKS[wallet.network].label}`,
            }))}
            placeholder={t("apiListing.create.fields.wallet.placeholder")}
          />
        )}

        {chosenWallet && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Tag size="sm" variant="neutral">
              {PAYMENT_NETWORKS[chosenWallet.network].label}
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
            <FormTextInput
              name="priceAmount"
              inputMode="decimal"
              placeholder="0.01"
            />
          </div>
          <div className="w-28">
            <FormTextInput
              id="api-listing-currency"
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
        title={t("apiListing.create.fields.asset.title")}
        description={t("apiListing.create.fields.asset.description")}
        htmlFor="api-listing-asset"
      >
        <FormTextInput
          name="assetAddress"
          placeholder={t("apiListing.create.fields.asset.placeholder")}
        />
      </FieldRow>

      <FieldRow
        title={t("apiListing.create.fields.priceLabel.title")}
        description={t("apiListing.create.fields.priceLabel.description")}
        htmlFor="api-listing-price-label"
      >
        <FormTextInput
          name="priceLabel"
          maxLength={64}
          placeholder={t("apiListing.create.fields.priceLabel.placeholder")}
        />
      </FieldRow>
    </>
  );
}

function TagsField() {
  const { t } = useTranslation();
  const { setValue, getFieldState, formState } =
    useFormContext<ApiListingValues>();
  const tags = useWatch<ApiListingValues, "tags">({ name: "tags" });
  const [text, setText] = useState("");
  const error = getFieldState("tags", formState).error?.message;

  const setTags = (next: string[]) =>
    setValue("tags", next, { shouldValidate: true, shouldDirty: true });

  const addTag = () => {
    const tag = text.trim().toLowerCase();
    setText("");
    if (tag && !tags.includes(tag) && tags.length < MAX_TAGS) {
      setTags([...tags, tag]);
    }
  };

  return (
    <FieldRow
      title={t("apiListing.create.fields.tags.title")}
      description={t("apiListing.create.fields.tags.description")}
      htmlFor="api-listing-tags"
    >
      <TextInput
        value={text}
        maxLength={32}
        placeholder={t("apiListing.create.fields.tags.placeholder")}
        error={error ? t(error) : undefined}
        onChange={setText}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addTag();
          }
        }}
      />
      <ul
        aria-label={t("apiListing.create.fields.tags.title")}
        className="mt-2 flex flex-wrap items-center gap-1.5"
      >
        {tags.map((tag) => (
          <li key={tag}>
            <button
              type="button"
              aria-label={t("apiListing.create.fields.tags.remove", { tag })}
              onClick={() => setTags(tags.filter((current) => current !== tag))}
            >
              <Tag size="sm" variant="neutral">
                <span className="inline-flex items-center gap-1">
                  {tag}
                  <X aria-hidden="true" className="h-3 w-3" />
                </span>
              </Tag>
            </button>
          </li>
        ))}
        {text.trim() && (
          <li>
            <Button
              intent="ghost"
              size="sm"
              className="btn-no-lift"
              onClick={addTag}
            >
              {t("apiListing.create.fields.tags.add")}
            </Button>
          </li>
        )}
      </ul>
    </FieldRow>
  );
}

function PublishingStep() {
  const { t } = useTranslation();

  return (
    <>
      <FieldRow
        title={t("apiListing.create.fields.method.title")}
        htmlFor="api-listing-method"
      >
        <FormSelect name="method" options={HTTP_METHOD_OPTIONS} />
      </FieldRow>

      <FieldRow
        title={t("apiListing.create.fields.url.title")}
        description={t("apiListing.create.fields.url.description")}
        htmlFor="api-listing-url"
      >
        <FormTextInput
          name="url"
          type="url"
          inputMode="url"
          placeholder="https://api.example.com/v1/limits"
        />
      </FieldRow>

      <FieldRow
        title={t("apiListing.create.fields.docsUrl.title")}
        description={t("apiListing.create.fields.docsUrl.description")}
        htmlFor="api-listing-docs-url"
      >
        <FormTextInput
          name="docsUrl"
          type="url"
          inputMode="url"
          placeholder="https://docs.example.com/api"
        />
      </FieldRow>

      <FieldRow
        title={t("apiListing.create.fields.category.title")}
        description={t("apiListing.create.fields.category.description")}
        htmlFor="api-listing-category"
      >
        <FormTextInput
          name="category"
          maxLength={64}
          placeholder={CATEGORY_SUGGESTIONS.join(", ")}
        />
      </FieldRow>

      <TagsField />

      <FieldRow
        title={t("apiListing.create.fields.visibility.title")}
        description={t("apiListing.create.fields.visibility.description")}
        htmlFor="api-listing-visibility"
      >
        <FormSelect
          name="visibility"
          options={VISIBILITY_OPTIONS.map((option) => ({
            value: option.value,
            title: t(option.labelKey),
          }))}
        />
      </FieldRow>
    </>
  );
}

export function ApiListingFormFields({
  step,
  wallets,
}: {
  step: number;
  wallets: Wallet[];
}) {
  return (
    <div className="flex flex-col divide-y divide-overlay/10">
      {step === 0 && <DetailsStep />}
      {step === 1 && <PaymentStep wallets={wallets} />}
      {step === 2 && <PublishingStep />}
    </div>
  );
}
