import { EmptyState } from "@4mica/ui";
import { useAppSelector } from "@stores/hooks";
import { selectCan } from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/usePageTitle";

export function FinancePage({
  titleKey,
  descriptionKey,
  action,
  children,
}: {
  titleKey: string;
  descriptionKey: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const canRead = useAppSelector(selectCan(PERMISSION.FINANCE_READ));
  const title = t(titleKey);
  usePageTitle(title);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-ink-muted text-sm">
            {t(descriptionKey)}
          </p>
        </div>
        {canRead && action && <div className="shrink-0">{action}</div>}
      </div>
      {canRead ? (
        children
      ) : (
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title={t("finance.noAccess.title")}
          description={t("finance.noAccess.description")}
          data-testid="finance-no-access"
        />
      )}
    </div>
  );
}
