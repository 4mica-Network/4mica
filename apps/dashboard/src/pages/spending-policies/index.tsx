import { Button } from "@4mica/ui";
import {
  fetchPolicies,
  selectPolicies,
  selectPoliciesError,
  selectPoliciesStatus,
} from "@stores/finance";
import type { SpendingPolicy } from "@stores/finance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectCan } from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import { Info, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FinancePage } from "@/components/Finance/FinancePage";
import { ListState } from "@/components/Finance/ListState";
import { PolicyCard } from "./PolicyCard";
import { PolicyFormModal } from "./PolicyFormModal";

export function CooperativeNotice() {
  const { t } = useTranslation();
  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-lg border border-overlay/10 bg-overlay/5 px-4 py-3 text-ink-muted text-sm"
      data-testid="policy-cooperative-notice"
    >
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{t("finance.policies.cooperative")}</p>
    </div>
  );
}

export function SpendingPolicies() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const policies = useAppSelector(selectPolicies);
  const status = useAppSelector(selectPoliciesStatus);
  const error = useAppSelector(selectPoliciesError);
  const canManage = useAppSelector(selectCan(PERMISSION.FINANCE_MANAGE));
  const [editing, setEditing] = useState<SpendingPolicy | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchPolicies());
  }, [dispatch]);

  const openForm = (policy: SpendingPolicy | null) => {
    setEditing(policy);
    setOpen(true);
  };

  return (
    <FinancePage
      titleKey="finance.policies.title"
      descriptionKey="finance.policies.description"
      action={
        canManage && (
          <Button
            type="button"
            intent="invert"
            size="sm"
            className="btn-no-lift"
            icon={<Plus aria-hidden="true" className="h-4 w-4" />}
            onClick={() => openForm(null)}
            data-testid="policy-create"
          >
            {t("finance.policies.create")}
          </Button>
        )
      }
    >
      <CooperativeNotice />
      <ListState
        status={status}
        error={error}
        isEmpty={policies.length === 0}
        empty={{
          icon: <ShieldCheck className="h-5 w-5" />,
          title: t("finance.policies.emptyTitle"),
          description: t("finance.policies.emptyDescription"),
        }}
        onRetry={() => dispatch(fetchPolicies())}
        data-testid="policies"
      >
        <div className="flex flex-col gap-3" data-testid="policies-list">
          {policies.map((policy) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              canManage={canManage}
              onEdit={openForm}
            />
          ))}
        </div>
      </ListState>

      {canManage && (
        <PolicyFormModal
          isOpen={open}
          policy={editing}
          onClose={() => setOpen(false)}
        />
      )}
    </FinancePage>
  );
}
