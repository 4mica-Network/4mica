import { isDecimalAmount, trimAmount } from "@4mica/rules";
import { Button, cn, EmptyState, Tag } from "@4mica/ui";
import {
  selectIsCustomerPolicyPending,
  setCustomerPolicy,
} from "@stores/customer";
import type { Customer, CustomerOverview } from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { Gauge } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  assetSymbol,
  parseTokenKey,
  tokenKey,
  tokenLabel,
  tokenOptions,
} from "@/components/Finance/token";
import { FieldRow, Select, TextInput } from "@/components/form";
import { SectionCard, SectionFooter } from "@/components/layout";
import { useDraft } from "@/hooks/useDraft";
import { useEnvironmentNetworks } from "@/hooks/useNetworkOptions";
import { usePrivacy } from "@/hooks/usePrivacy";

export const limitToken = (customer: Customer) =>
  customer.limitNetwork
    ? tokenKey(customer.limitNetwork, customer.limitAssetAddress ?? null)
    : "";

const rankingTotal = (
  overview: CustomerOverview,
  customer: Customer,
): number => {
  const token = limitToken(customer);
  return overview.recentSpend
    .filter(
      (bucket) =>
        !token ||
        tokenKey(
          bucket.network as Parameters<typeof tokenKey>[0],
          bucket.assetAddress,
        ) === token,
    )
    .reduce((sum, bucket) => sum + Number(bucket.amount), 0);
};

export const validateLimits = (
  draft: { dailyLimit: string; monthlyLimit: string; token: string },
  t: (key: string) => string,
) => {
  const errors: Partial<
    Record<"dailyLimit" | "monthlyLimit" | "token", string>
  > = {};
  for (const field of ["dailyLimit", "monthlyLimit"] as const) {
    const value = draft[field].trim();
    if (value && !isDecimalAmount(value)) {
      errors[field] = t("validation.decimal");
    }
  }
  if (
    (draft.dailyLimit.trim() || draft.monthlyLimit.trim()) &&
    !parseTokenKey(draft.token)
  ) {
    errors.token = t("customer.limits.tokenRequired");
  }
  return errors;
};

function LimitsEditor({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const networks = useEnvironmentNetworks();
  const isSaving = useAppSelector(selectIsCustomerPolicyPending(customer.id));
  const initial = useMemo(
    () => ({
      dailyLimit: customer.dailyLimit ?? "",
      monthlyLimit: customer.monthlyLimit ?? "",
      token: limitToken(customer),
    }),
    [customer],
  );
  const draft = useDraft(initial);
  const errors = validateLimits(draft.draft, t);
  const isInvalid = Object.keys(errors).length > 0;

  const options = useMemo(() => {
    const list = tokenOptions(networks);
    const current = initial.token;
    const parsed = parseTokenKey(current);
    if (parsed && !list.some((option) => option.value === current)) {
      list.push({
        value: current,
        title: tokenLabel(parsed.network, parsed.assetAddress),
      });
    }
    return [{ value: "", title: t("customer.limits.chooseToken") }, ...list];
  }, [networks, initial.token, t]);

  const save = () => {
    if (isInvalid || isSaving) {
      return;
    }
    const token = parseTokenKey(draft.draft.token);
    dispatch(
      setCustomerPolicy({
        id: customer.id,
        data: {
          dailyLimit: draft.draft.dailyLimit.trim() || null,
          monthlyLimit: draft.draft.monthlyLimit.trim() || null,
          limitNetwork: token?.network ?? null,
          limitAssetAddress: token?.assetAddress ?? null,
        },
      }),
    );
  };

  return (
    <div className="flex flex-col gap-2" data-testid="customer-limits-editor">
      <FieldRow
        title={t("customer.limits.token")}
        description={t("customer.limits.tokenHint")}
        htmlFor="customer-limit-token"
      >
        <Select
          id="customer-limit-token"
          value={draft.draft.token}
          options={options}
          error={errors.token}
          onChange={(value) => draft.set("token", value)}
        />
      </FieldRow>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <FieldRow
          title={t("customer.limits.daily")}
          htmlFor="customer-limit-daily"
        >
          <TextInput
            id="customer-limit-daily"
            inputMode="decimal"
            value={draft.draft.dailyLimit}
            placeholder="50"
            error={errors.dailyLimit}
            onChange={(value) => draft.set("dailyLimit", value)}
          />
        </FieldRow>
        <FieldRow
          title={t("customer.limits.monthly")}
          htmlFor="customer-limit-monthly-input"
        >
          <TextInput
            id="customer-limit-monthly-input"
            inputMode="decimal"
            value={draft.draft.monthlyLimit}
            placeholder="500"
            error={errors.monthlyLimit}
            onChange={(value) => draft.set("monthlyLimit", value)}
          />
        </FieldRow>
      </div>
      <SectionFooter>
        <Button
          type="button"
          intent="ghost"
          size="sm"
          disabled={!draft.isDirty || isSaving}
          onClick={draft.reset}
        >
          {t("settings.discard")}
        </Button>
        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift w-20 text-sm"
          loading={isSaving}
          disabled={!draft.isDirty || isInvalid}
          onClick={save}
          data-testid="customer-limits-save"
        >
          {t("settings.update")}
        </Button>
      </SectionFooter>
    </div>
  );
}

function LimitRow({
  label,
  limit,
  currency,
  spent,
  testId,
}: {
  label: string;
  limit: string;
  currency: string;
  spent?: number;
  testId: string;
}) {
  const { t } = useTranslation();
  const { mask } = usePrivacy();

  const ceiling = Number(limit);
  const ratio = spent !== undefined && ceiling > 0 ? spent / ceiling : 0;
  const percent = Math.min(Math.round(ratio * 100), 999);
  const over = ratio > 1;

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium text-ink-strong text-sm">{label}</span>
        <span className="shrink-0 font-medium text-ink-strong text-sm">
          {trimAmount(limit)} {currency}
        </span>
      </div>

      {spent !== undefined && (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-overlay/10">
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                over ? "bg-danger" : "bg-brand",
              )}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>

          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-ink-muted">
              {t("customer.limits.spent", {
                amount: mask(trimAmount(String(spent))),
              })}
            </span>
            <span className={over ? "text-danger" : "text-ink-muted"}>
              {over
                ? t("customer.limits.over", { percent })
                : t("customer.limits.within", { percent })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function LimitsPanel({
  customer,
  overview,
}: {
  customer: Customer;
  overview: CustomerOverview | null;
}) {
  const { t } = useTranslation();
  const currency = customer.limitNetwork
    ? assetSymbol(customer.limitNetwork, customer.limitAssetAddress ?? null)
    : customer.limitCurrency;
  const hasLimits = Boolean(customer.dailyLimit || customer.monthlyLimit);

  return (
    <SectionCard
      title={t("customer.detail.limitsTitle")}
      description={t("customer.detail.limitsLead")}
      data-testid="customer-limits"
    >
      {hasLimits && (
        <div className="flex flex-wrap items-center gap-2">
          {customer.limitNetwork ? (
            <Tag size="sm" variant="neutral" data-testid="customer-limit-token">
              {tokenLabel(
                customer.limitNetwork,
                customer.limitAssetAddress ?? null,
              )}
            </Tag>
          ) : (
            <>
              <Tag
                size="sm"
                variant="warning"
                data-testid="customer-limit-legacy"
              >
                {t("customer.limits.allTokens")}
              </Tag>
              <span className="text-ink-muted text-xs">
                {t("customer.limits.allTokensHint")}
              </span>
            </>
          )}
        </div>
      )}
      {!hasLimits ? (
        <EmptyState
          icon={<Gauge className="h-5 w-5" />}
          title={t("customer.limits.emptyTitle")}
          description={t("customer.limits.emptyDescription")}
          data-testid="customer-limits-empty"
        />
      ) : (
        <div className="flex flex-col gap-5">
          {customer.monthlyLimit && (
            <LimitRow
              label={t("customer.limits.monthly")}
              limit={customer.monthlyLimit}
              currency={currency}
              spent={overview ? rankingTotal(overview, customer) : undefined}
              testId="customer-limit-monthly"
            />
          )}

          {customer.dailyLimit && (
            <LimitRow
              label={t("customer.limits.daily")}
              limit={customer.dailyLimit}
              currency={currency}
              testId="customer-limit-daily"
            />
          )}
        </div>
      )}
      <LimitsEditor customer={customer} />
    </SectionCard>
  );
}
