import {
  findPaymentAsset,
  PAYMENT_ASSETS,
  type PaymentNetwork,
} from "@4mica/rules";
import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FieldRow, FormSelect, FormTextInput } from "@/components/form";

export const NATIVE_ASSET = "native";

export const toAssetFormValue = (address: string | null | undefined) =>
  address ?? NATIVE_ASSET;

export const fromAssetFormValue = (value: string | null | undefined) =>
  !value || value === NATIVE_ASSET ? null : value;

export function PriceField({
  network,
  idPrefix,
  title,
  description,
  placeholder,
}: {
  network: PaymentNetwork | null;
  idPrefix: string;
  title: string;
  description?: string;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const { setValue, getValues } = useFormContext();
  const assetValue = useWatch({ name: "assetAddress" }) as string | undefined;

  const assets = network ? PAYMENT_ASSETS[network] : [];
  const selected = network
    ? findPaymentAsset(network, fromAssetFormValue(assetValue))
    : null;

  useEffect(() => {
    if (!network) {
      return;
    }
    const current = fromAssetFormValue(getValues("assetAddress"));
    if (!findPaymentAsset(network, current)) {
      setValue("assetAddress", NATIVE_ASSET, { shouldDirty: true });
    }
  }, [network, getValues, setValue]);

  return (
    <FieldRow
      title={title}
      description={network ? description : t("form.tokenNeedsNetwork")}
      htmlFor={`${idPrefix}-price`}
    >
      <div className="flex gap-2">
        <div className="flex-1">
          <FormTextInput
            id={`${idPrefix}-price`}
            name="priceAmount"
            inputMode="decimal"
            placeholder={placeholder}
            trailingIcon={
              selected ? (
                <span className="text-ink-muted text-xs">
                  {selected.symbol}
                </span>
              ) : undefined
            }
          />
        </div>
        <div className="w-36">
          <FormSelect
            id={`${idPrefix}-asset`}
            name="assetAddress"
            aria-label={t("form.token")}
            disabled={!network}
            placeholder={t("form.token")}
            options={assets.map((asset) => ({
              value: asset.address ?? NATIVE_ASSET,
              title: asset.symbol,
            }))}
          />
        </div>
      </div>
    </FieldRow>
  );
}
