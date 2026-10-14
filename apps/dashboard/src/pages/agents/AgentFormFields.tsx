import { PAYMENT_NETWORKS, shortenAddress } from "@4mica/rules";
import { Tag } from "@4mica/ui";
import type { Wallet } from "@stores/wallet/type";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  FieldRow,
  FormSelect,
  FormTextArea,
  FormTextInput,
} from "@/components/form";
import { NETWORK_OPTIONS } from "@/lib/networks";
import { STATUS_OPTIONS, VISIBILITY_OPTIONS } from "./constants";
import {
  type AgentValues,
  DESCRIPTION_MAX_LENGTH,
  HEADLINE_MAX_LENGTH,
  NAME_MAX_LENGTH,
} from "./validation";

export interface AgentFormFieldsProps {
  wallets: Wallet[];
  payerWallets: Wallet[];
  idPrefix: string;
  step?: number;
  networkLocked?: boolean;
}

const walletOption = (wallet: Wallet) => ({
  value: wallet.id,
  title: `${wallet.label} · ${PAYMENT_NETWORKS[wallet.network].label}`,
});

export function AgentFormFields({
  wallets,
  payerWallets,
  idPrefix,
  step,
  networkLocked = false,
}: AgentFormFieldsProps) {
  const { t } = useTranslation();
  const show = (index: number) => step === undefined || step === index;
  const [walletId, payerWalletId] = useWatch<
    AgentValues,
    ["walletId", "payerWalletId"]
  >({ name: ["walletId", "payerWalletId"] });

  const chosenSeller = wallets.find((w) => w.id === walletId);
  const chosenPayer = payerWallets.find((w) => w.id === payerWalletId);

  return (
    <div className="flex flex-col divide-y divide-overlay/10">
      {show(0) && (
        <>
          <FieldRow
            title={t("agent.fields.name.title")}
            description={t("agent.fields.name.description")}
            htmlFor={`${idPrefix}-name`}
            required
          >
            <FormTextInput
              name="name"
              maxLength={NAME_MAX_LENGTH}
              placeholder={t("agent.fields.name.placeholder")}
              autoFocus
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.headline.title")}
            description={t("agent.fields.headline.description")}
            htmlFor={`${idPrefix}-headline`}
          >
            <FormTextInput
              name="headline"
              maxLength={HEADLINE_MAX_LENGTH}
              spellCheck
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.description.title")}
            htmlFor={`${idPrefix}-description`}
          >
            <FormTextArea
              name="description"
              rows={4}
              maxLength={DESCRIPTION_MAX_LENGTH}
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
            <FormSelect
              name="network"
              options={NETWORK_OPTIONS}
              disabled={networkLocked}
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.payerWallet.title")}
            description={t("agent.fields.payerWallet.description")}
            htmlFor={`${idPrefix}-payer-wallet`}
          >
            <FormSelect
              name="payerWalletId"
              options={[
                { value: "", title: t("agent.fields.payerWallet.none") },
                ...payerWallets.map(walletOption),
              ]}
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
            <FormTextInput
              name="creditLimit"
              inputMode="decimal"
              placeholder="0"
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
            <FormSelect
              name="walletId"
              options={[
                { value: "", title: t("agent.fields.wallet.none") },
                ...wallets.map(walletOption),
              ]}
            />
            {chosenSeller && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Tag size="sm" variant="neutral">
                  {PAYMENT_NETWORKS[chosenSeller.network].label}
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
            <FormTextInput
              name="endpointUrl"
              type="url"
              inputMode="url"
              placeholder="https://agents.example.com/atlas/brief"
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.price.title")}
            description={t("agent.fields.price.description")}
            htmlFor={`${idPrefix}-price`}
          >
            <div className="flex gap-2">
              <div className="flex-1">
                <FormTextInput
                  name="priceAmount"
                  inputMode="decimal"
                  placeholder="0.002"
                />
              </div>
              <div className="w-28">
                <FormTextInput
                  id={`${idPrefix}-currency`}
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
            title={t("agent.fields.asset.title")}
            description={t("agent.fields.asset.description")}
            htmlFor={`${idPrefix}-asset`}
          >
            <FormTextInput name="assetAddress" placeholder="0x…" />
          </FieldRow>
        </>
      )}

      {show(3) && (
        <>
          <FieldRow
            title={t("agent.fields.docsUrl.title")}
            htmlFor={`${idPrefix}-docs`}
          >
            <FormTextInput name="docsUrl" type="url" inputMode="url" />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.avatarUrl.title")}
            htmlFor={`${idPrefix}-avatar`}
          >
            <FormTextInput name="avatarUrl" type="url" inputMode="url" />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.status.title")}
            description={t("agent.fields.status.description")}
            htmlFor={`${idPrefix}-status`}
          >
            <FormSelect
              name="status"
              options={STATUS_OPTIONS.map((option) => ({
                value: option.value,
                title: t(option.labelKey),
              }))}
            />
          </FieldRow>

          <FieldRow
            title={t("agent.fields.visibility.title")}
            htmlFor={`${idPrefix}-visibility`}
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
      )}
    </div>
  );
}
