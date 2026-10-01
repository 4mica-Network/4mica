import { Button, cn, Spinner, Tag } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  addCustomerIdentity,
  removeCustomerIdentity,
} from "@stores/customer/actions";
import {
  selectCustomerIssues,
  selectIsCustomerPending,
} from "@stores/customer/selector";
import type { Customer, CustomerIdentity } from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextInput } from "@/components/form";
import {
  explorerAddressUrl,
  NETWORK_OPTIONS,
  NETWORKS,
  shortenAddress,
} from "@/lib/networks";
import {
  IDENTITY_SOURCE_LABEL_KEYS,
  IDENTITY_TYPE_LABEL_KEYS,
  IDENTITY_TYPE_OPTIONS,
} from "../customers/constants";
import { type IdentityValues, identitySchema } from "../customers/validation";

const PENDING_KEY = "customerIdentity";

function IdentityRow({
  customerId,
  identity,
}: {
  customerId: string;
  identity: CustomerIdentity;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isPending = useAppSelector(
    selectIsCustomerPending(`customerIdentity:${identity.id}`),
  );

  return (
    <div
      className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
      data-testid={`customer-identity-${identity.id}`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Tag size="sm" variant="neutral">
            {t(IDENTITY_TYPE_LABEL_KEYS[identity.type])}
          </Tag>

          {identity.network && (
            <Tag size="sm" variant="neutral">
              {NETWORKS[identity.network].label}
            </Tag>
          )}

          <Tag size="sm" variant={identity.verifiedAt ? "success" : "neutral"}>
            {t(IDENTITY_SOURCE_LABEL_KEYS[identity.source])}
          </Tag>
        </div>

        {identity.address && identity.network ? (
          <a
            href={explorerAddressUrl(identity.network, identity.address)}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-w-0 items-center gap-1 font-mono text-ink-body text-sm transition-colors hover:text-ink-strong"
          >
            {shortenAddress(identity.address)}
            <ArrowUpRight className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span className="min-w-0 truncate text-ink-body text-sm">
            {identity.value}
          </span>
        )}

        {(identity.validFrom || identity.validUntil) && (
          <span className="text-ink-subtle text-xs">
            {t("customer.identity.window", {
              from: identity.validFrom
                ? new Date(identity.validFrom).toLocaleDateString()
                : t("customer.identity.always"),
              until: identity.validUntil
                ? new Date(identity.validUntil).toLocaleDateString()
                : t("customer.identity.ongoing"),
            })}
          </span>
        )}
      </div>

      <Button
        type="button"
        intent="ghost"
        size="sm"
        className="btn-no-lift shrink-0 text-danger"
        disabled={isPending}
        aria-label={t("customer.identity.remove")}
        onClick={() =>
          dispatch(
            removeCustomerIdentity({
              id: customerId,
              identityId: identity.id,
            }),
          )
        }
        data-testid={`customer-identity-remove-${identity.id}`}
      >
        {isPending ? <Spinner size="sm" /> : <Trash2 className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function IdentitiesPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(selectIsCustomerPending(PENDING_KEY));
  const issues = useAppSelector(selectCustomerIssues);

  const [isAdding, setIsAdding] = useState(false);

  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<IdentityValues>({
    resolver: zodResolver(identitySchema),
    mode: "onBlur",
    defaultValues: { type: "WALLET", network: "", address: "", value: "" },
  });

  const values = watch();

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
    if (Object.keys(issues).length === 0) {
      setIsAdding(false);
      reset();
    }
  }, [isSaving, issues, reset]);

  const fieldError = (field: keyof IdentityValues) => {
    if (issues[field]) {
      return issues[field];
    }
    const message = errors[field]?.message;
    return message ? t(message) : undefined;
  };

  const onValid = (data: IdentityValues) => {
    dispatch(
      addCustomerIdentity({
        id: customer.id,
        data:
          data.type === "WALLET"
            ? {
                type: "WALLET",
                network: data.network as never,
                address: data.address as string,
                source: "MANUAL",
              }
            : {
                type: data.type,
                value: data.value as string,
                source: "MANUAL",
              },
      }),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {customer.identities.length > 0 ? (
        <div className="flex flex-col divide-y divide-overlay/10">
          {customer.identities.map((identity) => (
            <IdentityRow
              key={identity.id}
              customerId={customer.id}
              identity={identity}
            />
          ))}
        </div>
      ) : (
        <p className="text-ink-muted text-sm">{t("customer.identity.empty")}</p>
      )}

      {isAdding ? (
        <div className="flex flex-col gap-3 rounded-lg border border-overlay/10 bg-overlay/5 px-4 py-3">
          <div className="flex flex-col divide-y divide-overlay/10">
            <FieldRow
              title={t("customer.identity.typeLabel")}
              htmlFor="identity-type"
            >
              <Select
                id="identity-type"
                value={values.type}
                onChange={(value) =>
                  setValue("type", value as never, { shouldValidate: true })
                }
                options={IDENTITY_TYPE_OPTIONS.map((option) => ({
                  value: option.value,
                  title: t(option.titleKey),
                }))}
              />
            </FieldRow>

            {values.type === "WALLET" ? (
              <>
                <FieldRow
                  title={t("customer.identity.networkLabel")}
                  htmlFor="identity-network"
                >
                  <Select
                    id="identity-network"
                    value={values.network ?? ""}
                    onChange={(value) =>
                      setValue("network", value as never, {
                        shouldValidate: true,
                      })
                    }
                    options={[
                      { value: "", title: t("customer.identity.pickNetwork") },
                      ...NETWORK_OPTIONS,
                    ]}
                    error={fieldError("network")}
                  />
                </FieldRow>

                <FieldRow
                  title={t("customer.identity.addressLabel")}
                  description={t("customer.identity.addressDescription")}
                  htmlFor="identity-address"
                >
                  <TextInput
                    id="identity-address"
                    value={values.address ?? ""}
                    onChange={(value) =>
                      setValue("address", value, { shouldValidate: true })
                    }
                    placeholder="0x…"
                    maxLength={42}
                    error={fieldError("address")}
                  />
                </FieldRow>
              </>
            ) : (
              <FieldRow
                title={t("customer.identity.valueLabel")}
                description={t("customer.identity.valueDescription")}
                htmlFor="identity-value"
              >
                <TextInput
                  id="identity-value"
                  value={values.value ?? ""}
                  onChange={(value) =>
                    setValue("value", value, { shouldValidate: true })
                  }
                  maxLength={320}
                  error={fieldError("value")}
                />
              </FieldRow>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              intent="ghost"
              size="sm"
              className="btn-no-lift"
              disabled={isSaving}
              onClick={() => {
                setIsAdding(false);
                reset();
              }}
            >
              {t("customer.identity.cancel")}
            </Button>
            <Button
              type="button"
              intent="invert"
              size="sm"
              className={cn("btn-no-lift min-w-28")}
              disabled={isSaving}
              onClick={handleSubmit(onValid)}
              data-testid="customer-identity-save"
            >
              <span className="flex w-full items-center justify-center text-sm">
                {isSaving ? <Spinner size="sm" /> : t("customer.identity.save")}
              </span>
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          intent="outline"
          size="sm"
          className="btn-no-lift self-start"
          onClick={() => setIsAdding(true)}
          data-testid="customer-identity-add"
        >
          <span className="flex items-center gap-1.5 text-sm">
            <Plus className="h-4 w-4" />
            {t("customer.identity.add")}
          </span>
        </Button>
      )}
    </div>
  );
}
