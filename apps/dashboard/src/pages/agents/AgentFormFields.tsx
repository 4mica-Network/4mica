import { Tag } from "@4mica/ui";
import type { Wallet } from "@stores/wallet/type";
import type { TFunction } from "i18next";
import type { UseFormSetValue } from "react-hook-form";
import { FieldRow, Select, TextArea, TextInput } from "@/components/form";
import { NETWORK_OPTIONS, NETWORKS, shortenAddress } from "@/lib/networks";
import { STATUS_OPTIONS, VISIBILITY_OPTIONS } from "./constants";
import {
  type AgentValues,
  HEADLINE_MAX_LENGTH,
  NAME_MAX_LENGTH,
} from "./validation";

export interface AgentFormFieldsProps {
  t: TFunction;
  values: AgentValues;
  setValue: UseFormSetValue<AgentValues>;
  fieldError: (field: keyof AgentValues) => string | undefined;
  wallets: Wallet[];
  payerWallets: Wallet[];
  idPrefix: string;
  step?: number;
  networkLocked?: boolean;
}

const NO_WALLET = "__none__";

export function AgentFormFields({
  t,
  values,
  setValue,
  fieldError,
  wallets,
  payerWallets,
  idPrefix,
  step,
  networkLocked = false,
}: AgentFormFieldsProps) {
  const show = (index: number) => step === undefined || step === index;

  const sellerOptions = [
    { value: NO_WALLET, title: t("agent.fields.wallet.none") },
    ...wallets.map((wallet) => ({
      value: wallet.id,
      title: `${wallet.label} · ${NETWORKS[wallet.network].label}`,
    })),
  ];

  const payerOptions = [
    { value: NO_WALLET, title: t("agent.fields.payerWallet.none") },
    ...payerWallets.map((wallet) => ({
      value: wallet.id,
      title: `${wallet.label} · ${NETWORKS[wallet.network].label}`,
    })),
  ];

  const chosenSeller = wallets.find((w) => w.id === values.walletId);
  const chosenPayer = payerWallets.find((w) => w.id === values.payerWalletId);

  return (
    <div className="flex flex-col divide-y divide-overlay/10">
      {show(0) && (
        <>
          <FieldRow
            title={t("agent.fields.name.title")}
            description={t("agent.fields.name.description")}
            htmlFor={`${idPrefix}-name`}
          >
            <TextInput
              id={`${idPrefix}-name`}
              value={values.name}
              maxLength={NAME_MAX_LENGTH}
              placeholder={t("agent.fields.name.placeholder")}
              error={fieldError("name")}
              onChange={(value) =>
                setValue("name", value, { shouldValidate: true })
              }
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.headline.title")}
            description={t("agent.fields.headline.description")}
            htmlFor={`${idPrefix}-headline`}
          >
            <TextInput
              id={`${idPrefix}-headline`}
              value={values.headline ?? ""}
              maxLength={HEADLINE_MAX_LENGTH}
              error={fieldError("headline")}
              onChange={(value) =>
                setValue("headline", value, { shouldValidate: true })
              }
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.description.title")}
            htmlFor={`${idPrefix}-description`}
          >
            <TextArea
              id={`${idPrefix}-description`}
              rows={4}
              value={values.description ?? ""}
              error={fieldError("description")}
              onChange={(value) =>
                setValue("description", value, { shouldValidate: true })
              }
            />
          </FieldRow>
        </>
      )}

      {show(1) && (
        <>
          <FieldRow
            title={t("agent.fields.network.title")}
            description={
              networkLocked
                ? t("agent.fields.network.locked")
                : t("agent.fields.network.description")
            }
            htmlFor={`${idPrefix}-network`}
          >
            <Select
              id={`${idPrefix}-network`}
              value={values.network}
              options={NETWORK_OPTIONS}
              disabled={networkLocked}
              error={fieldError("network")}
              onChange={(value) =>
                setValue("network", value as AgentValues["network"], {
                  shouldValidate: true,
                })
              }
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.payerWallet.title")}
            description={t("agent.fields.payerWallet.description")}
            htmlFor={`${idPrefix}-payer-wallet`}
          >
            <Select
              id={`${idPrefix}-payer-wallet`}
              value={values.payerWalletId || NO_WALLET}
              options={payerOptions}
              error={fieldError("payerWalletId")}
              onChange={(value) =>
                setValue("payerWalletId", value === NO_WALLET ? "" : value, {
                  shouldValidate: true,
                })
              }
            />
            {chosenPayer && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Tag size="sm" variant="neutral" className="font-mono">
                  {shortenAddress(chosenPayer.address)}
                </Tag>
                <span className="text-ink-subtle text-xs">
                  {t("agent.fields.payerWallet.privateHint")}
                </span>
              </div>
            )}
          </FieldRow>

          <FieldRow
            title={t("agent.fields.creditLimit.title")}
            description={t("agent.fields.creditLimit.description")}
            htmlFor={`${idPrefix}-credit-limit`}
          >
            <TextInput
              id={`${idPrefix}-credit-limit`}
              value={values.creditLimit ?? ""}
              placeholder="0"
              error={fieldError("creditLimit")}
              onChange={(value) =>
                setValue("creditLimit", value, { shouldValidate: true })
              }
            />
          </FieldRow>
        </>
      )}

      {show(2) && (
        <>
          <FieldRow
            title={t("agent.fields.wallet.title")}
            description={t("agent.fields.wallet.description")}
            htmlFor={`${idPrefix}-wallet`}
          >
            <Select
              id={`${idPrefix}-wallet`}
              value={values.walletId || NO_WALLET}
              options={sellerOptions}
              error={fieldError("walletId")}
              onChange={(value) =>
                setValue("walletId", value === NO_WALLET ? "" : value, {
                  shouldValidate: true,
                })
              }
            />
            {chosenSeller && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Tag size="sm" variant="neutral">
                  {NETWORKS[chosenSeller.network].label}
                </Tag>
                <Tag size="sm" variant="neutral" className="font-mono">
                  {shortenAddress(chosenSeller.address)}
                </Tag>
                <span className="text-ink-subtle text-xs">
                  {t("agent.fields.wallet.publicHint")}
                </span>
              </div>
            )}
          </FieldRow>

          <FieldRow
            title={t("agent.fields.endpointUrl.title")}
            description={t("agent.fields.endpointUrl.description")}
            htmlFor={`${idPrefix}-endpoint`}
          >
            <TextInput
              id={`${idPrefix}-endpoint`}
              value={values.endpointUrl ?? ""}
              placeholder="https://agents.example.com/atlas/brief"
              error={fieldError("endpointUrl")}
              onChange={(value) =>
                setValue("endpointUrl", value, { shouldValidate: true })
              }
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.price.title")}
            description={t("agent.fields.price.description")}
            htmlFor={`${idPrefix}-price`}
          >
            <div className="flex gap-2">
              <div className="flex-1">
                <TextInput
                  id={`${idPrefix}-price`}
                  value={values.priceAmount ?? ""}
                  placeholder="0.002"
                  error={fieldError("priceAmount")}
                  onChange={(value) =>
                    setValue("priceAmount", value, { shouldValidate: true })
                  }
                />
              </div>
              <div className="w-28">
                <TextInput
                  id={`${idPrefix}-currency`}
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
            title={t("agent.fields.asset.title")}
            description={t("agent.fields.asset.description")}
            htmlFor={`${idPrefix}-asset`}
          >
            <TextInput
              id={`${idPrefix}-asset`}
              value={values.assetAddress ?? ""}
              error={fieldError("assetAddress")}
              onChange={(value) =>
                setValue("assetAddress", value, { shouldValidate: true })
              }
            />
          </FieldRow>
        </>
      )}

      {show(3) && (
        <>
          <FieldRow
            title={t("agent.fields.docsUrl.title")}
            htmlFor={`${idPrefix}-docs`}
          >
            <TextInput
              id={`${idPrefix}-docs`}
              value={values.docsUrl ?? ""}
              error={fieldError("docsUrl")}
              onChange={(value) =>
                setValue("docsUrl", value, { shouldValidate: true })
              }
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.avatarUrl.title")}
            htmlFor={`${idPrefix}-avatar`}
          >
            <TextInput
              id={`${idPrefix}-avatar`}
              value={values.avatarUrl ?? ""}
              error={fieldError("avatarUrl")}
              onChange={(value) =>
                setValue("avatarUrl", value, { shouldValidate: true })
              }
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.status.title")}
            description={t("agent.fields.status.description")}
            htmlFor={`${idPrefix}-status`}
          >
            <Select
              id={`${idPrefix}-status`}
              value={values.status}
              options={STATUS_OPTIONS.map((option) => ({
                value: option.value,
                title: t(option.labelKey),
              }))}
              error={fieldError("status")}
              onChange={(value) =>
                setValue("status", value as AgentValues["status"], {
                  shouldValidate: true,
                })
              }
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.visibility.title")}
            htmlFor={`${idPrefix}-visibility`}
          >
            <Select
              id={`${idPrefix}-visibility`}
              value={values.visibility}
              options={VISIBILITY_OPTIONS.map((option) => ({
                value: option.value,
                title: t(option.labelKey),
              }))}
              error={fieldError("visibility")}
              onChange={(value) =>
                setValue("visibility", value as AgentValues["visibility"], {
                  shouldValidate: true,
                })
              }
            />
          </FieldRow>
        </>
      )}
    </div>
  );
}
