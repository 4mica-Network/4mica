import { EmptyState } from "@4mica/ui";
import type { LoadStatus } from "@stores/organization/type";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageSpinner } from "@/components/PageSpinner";

export function ListState({
  status,
  error,
  isEmpty,
  empty,
  onRetry,
  children,
  "data-testid": testId,
}: {
  status: LoadStatus;
  error: string | null;
  isEmpty: boolean;
  empty: { icon: ReactNode; title: string; description?: string };
  onRetry: () => void;
  children: ReactNode;
  "data-testid"?: string;
}) {
  const { t } = useTranslation();
  if (status === "idle" || status === "loading") {
    return <PageSpinner />;
  }
  if (status === "failed") {
    return (
      <EmptyState
        icon={<TriangleAlert className="h-5 w-5" />}
        title={t("finance.loadFailed")}
        description={error ?? undefined}
        action={{ label: t("finance.retry"), onClick: onRetry }}
        data-testid={testId && `${testId}-error`}
      />
    );
  }
  if (isEmpty) {
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        data-testid={testId && `${testId}-empty`}
      />
    );
  }
  return <>{children}</>;
}
