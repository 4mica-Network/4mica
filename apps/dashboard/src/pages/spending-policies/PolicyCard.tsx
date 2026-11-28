import { trimAmount } from "@4mica/rules";
import { Button, Card, cn, Tag } from "@4mica/ui";
import {
  deletePolicy,
  financePendingKeys,
  freezePolicy,
  selectIsFinancePending,
} from "@stores/finance";
import type { SpendingPolicy } from "@stores/finance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectProjects } from "@stores/project/selector";
import { Pencil, Snowflake, Sun, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { assetSymbol, tokenLabel } from "@/components/Finance/token";
import { Masked } from "@/components/Masked";
import { Spinner } from "@/components/Spinner";

export const usagePercent = (spent: string, limit: string): number => {
  const ceiling = Number(limit);
  return ceiling > 0
    ? Math.min(Math.round((Number(spent) / ceiling) * 100), 999)
    : 0;
};

function UsageBar({
  label,
  spent,
  limit,
  symbol,
  testId,
}: {
  label: string;
  spent: string;
  limit: string;
  symbol: string;
  testId: string;
}) {
  const { t } = useTranslation();
  const percent = usagePercent(spent, limit);
  const over = percent >= 100;
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="text-ink-body tabular-nums">
          <Masked>
            {t("finance.policy.usageOf", {
              spent: trimAmount(spent),
              limit: trimAmount(limit),
              symbol,
            })}
          </Masked>
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-overlay/10"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            over ? "bg-danger" : percent >= 80 ? "bg-warning" : "bg-brand",
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

function useTargetLabel(policy: SpendingPolicy): string {
  const { t } = useTranslation();
  const projects = useAppSelector(selectProjects);
  if (policy.scope === "ORGANIZATION") {
    return t("finance.scope.ORGANIZATION");
  }
  if (policy.scope === "PROJECT") {
    const project = projects.find((item) => item.id === policy.projectId);
    return `${t("finance.scope.PROJECT")} · ${project?.name ?? policy.projectId ?? ""}`;
  }
  const id = policy.scope === "AGENT" ? policy.agentId : policy.apiKeyId;
  return `${t(`finance.scope.${policy.scope}`)} · ${id?.slice(0, 8) ?? ""}`;
}

export function PolicyCard({
  policy,
  canManage,
  onEdit,
}: {
  policy: SpendingPolicy;
  canManage: boolean;
  onEdit: (policy: SpendingPolicy) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsFinancePending(financePendingKeys.policy(policy.id)),
  );
  const target = useTargetLabel(policy);
  const symbol = policy.network
    ? assetSymbol(policy.network, policy.assetAddress)
    : "";
  const usage = policy.usage;

  return (
    <Card
      className={cn("flex flex-col gap-4", policy.frozen && "border-danger/40")}
      data-testid={`policy-${policy.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-ink-strong text-sm">
              {policy.name}
            </h3>
            <Tag
              size="sm"
              variant={policy.mode === "ENFORCE" ? "default" : "neutral"}
              data-testid={`policy-mode-${policy.id}`}
            >
              {t(`finance.mode.${policy.mode}`)}
            </Tag>
            {policy.frozen && (
              <Tag
                size="sm"
                variant="error"
                data-testid={`policy-frozen-${policy.id}`}
              >
                {t("finance.policy.frozen")}
              </Tag>
            )}
            {!policy.enabled && (
              <Tag size="sm" variant="neutral">
                {t("finance.policy.disabled")}
              </Tag>
            )}
          </div>
          <p className="mt-1 text-ink-muted text-xs">
            {target} ·{" "}
            {policy.network
              ? tokenLabel(policy.network, policy.assetAddress)
              : t("finance.policy.anyToken")}
          </p>
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            {isPending && <Spinner size="sm" className="text-ink-subtle" />}
            <Button
              type="button"
              intent="ghost"
              size="sm"
              className="btn-no-lift px-2"
              aria-label={t("finance.policy.editLabel", { name: policy.name })}
              disabled={isPending}
              onClick={() => onEdit(policy)}
              data-testid={`policy-edit-${policy.id}`}
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
            </Button>
            <ConfirmAction
              title={
                policy.frozen
                  ? t("finance.policy.unfreezeTitle", { name: policy.name })
                  : t("finance.policy.freezeTitle", { name: policy.name })
              }
              description={
                policy.frozen
                  ? t("finance.policy.unfreezeBody")
                  : t("finance.policy.freezeBody")
              }
              confirmLabel={
                policy.frozen
                  ? t("finance.policy.unfreeze")
                  : t("finance.policy.freeze")
              }
              onConfirm={() =>
                dispatch(
                  freezePolicy({ id: policy.id, frozen: !policy.frozen }),
                )
              }
              data-testid={`policy-freeze-confirm-${policy.id}`}
            >
              <Button
                type="button"
                intent="ghost"
                size="sm"
                className="btn-no-lift px-2"
                aria-label={
                  policy.frozen
                    ? t("finance.policy.unfreeze")
                    : t("finance.policy.freeze")
                }
                disabled={isPending}
                data-testid={`policy-freeze-${policy.id}`}
              >
                {policy.frozen ? (
                  <Sun aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Snowflake aria-hidden="true" className="h-4 w-4" />
                )}
              </Button>
            </ConfirmAction>
            <ConfirmAction
              title={t("finance.policy.deleteTitle", { name: policy.name })}
              description={t("finance.policy.deleteBody")}
              onConfirm={() => dispatch(deletePolicy({ id: policy.id }))}
              data-testid={`policy-delete-confirm-${policy.id}`}
            >
              <Button
                type="button"
                intent="ghost"
                size="sm"
                className="btn-no-lift px-2"
                aria-label={t("finance.policy.deleteLabel", {
                  name: policy.name,
                })}
                disabled={isPending}
                data-testid={`policy-delete-${policy.id}`}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            </ConfirmAction>
          </div>
        )}
      </div>

      {(policy.dailyLimit || policy.monthlyLimit) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {policy.dailyLimit && (
            <UsageBar
              label={t("finance.policy.today")}
              spent={usage?.spentToday ?? "0"}
              limit={policy.dailyLimit}
              symbol={symbol}
              testId={`policy-usage-daily-${policy.id}`}
            />
          )}
          {policy.monthlyLimit && (
            <UsageBar
              label={t("finance.policy.thisMonth")}
              spent={usage?.spentThisMonth ?? "0"}
              limit={policy.monthlyLimit}
              symbol={symbol}
              testId={`policy-usage-monthly-${policy.id}`}
            />
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-ink-subtle">
            {t("finance.policy.fields.perPaymentLimit")}
          </dt>
          <dd className="text-ink-body tabular-nums">
            {policy.perPaymentLimit
              ? `${trimAmount(policy.perPaymentLimit)} ${symbol}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-subtle">
            {t("finance.policy.fields.approvalThreshold")}
          </dt>
          <dd className="text-ink-body tabular-nums">
            {policy.approvalThreshold
              ? t("finance.policy.thresholdValue", {
                  amount: `${trimAmount(policy.approvalThreshold)} ${symbol}`,
                  count: policy.approvalsRequired,
                })
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-subtle">
            {t("finance.policy.fields.recipients")}
          </dt>
          <dd className="text-ink-body">
            {policy.allowedRecipients.length > 0
              ? t("finance.policy.recipientCount", {
                  count: policy.allowedRecipients.length,
                })
              : t("finance.policy.anyRecipient")}
          </dd>
        </div>
        <div>
          <dt className="text-ink-subtle">{t("finance.policy.reserved")}</dt>
          <dd className="text-ink-body tabular-nums">
            <Masked>
              {usage ? `${trimAmount(usage.reserved)} ${symbol}` : "—"}
            </Masked>
          </dd>
        </div>
      </dl>
    </Card>
  );
}
