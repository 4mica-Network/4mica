import { Button, EmptyState } from "@4mica/ui";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function RetryState({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message: string | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <EmptyState
      className="flex-1"
      icon={<TriangleAlert className="h-5 w-5" />}
      title={title ?? t("loadFailure.title")}
      description={message ?? t("loadFailure.description")}
      action={{ label: t("loadFailure.retry"), onClick: onRetry }}
      data-testid="load-failure"
    />
  );
}

export function LoadFailure({
  notFound,
  notFoundLabel,
  message,
  onRetry,
  backTo,
  backLabel,
}: {
  notFound: boolean;
  notFoundLabel: string;
  message: string | null;
  onRetry: () => void;
  backTo: string;
  backLabel: string;
}) {
  if (!notFound) {
    return <RetryState message={message} onRetry={onRetry} />;
  }

  return (
    <div className="flex flex-col items-start gap-4 py-10">
      <p className="text-ink-muted text-sm">{notFoundLabel}</p>
      <Button asChild intent="outline" size="sm">
        <Link to={backTo}>{backLabel}</Link>
      </Button>
    </div>
  );
}
