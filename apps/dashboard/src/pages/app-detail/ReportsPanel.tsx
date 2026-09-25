import { Button, EmptyState, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { updateReport } from "@stores/trust/actions";
import { selectIsTrustPending, selectReports } from "@stores/trust/selector";
import type { Report, ReportStatus } from "@stores/trust/type";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

const STATUS_VARIANT: Record<ReportStatus, "warning" | "neutral" | "success"> =
  {
    OPEN: "warning",
    ACKNOWLEDGED: "neutral",
    RESOLVED: "success",
    DISMISSED: "neutral",
  };

function ReportRow({
  report,
  kind,
  id,
}: {
  report: Report;
  kind: "listing" | "agent";
  id: string;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(selectIsTrustPending(`report:${report.id}`));

  const act = (status: "ACKNOWLEDGED" | "RESOLVED") =>
    dispatch(updateReport({ kind, id }, report.id, status));

  return (
    <li className="flex flex-col gap-2 border-overlay/10 border-b py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tag size="sm" variant={STATUS_VARIANT[report.status]}>
          {t(`appDetail.reportStatus.${report.status}`)}
        </Tag>
        <span className="font-medium text-ink-strong text-sm">
          {t(`appDetail.reportReason.${report.reason}`)}
        </span>
        <span className="ml-auto text-ink-subtle text-xs">
          {new Date(report.createdAt).toLocaleDateString()}
        </span>
      </div>

      {report.detail && (
        <p className="whitespace-pre-line text-ink-body text-sm">
          {report.detail}
        </p>
      )}

      {report.status !== "RESOLVED" && report.status !== "DISMISSED" && (
        <div className="flex gap-2">
          {report.status === "OPEN" && (
            <Button
              disabled={isPending}
              intent="outline"
              onClick={() => act("ACKNOWLEDGED")}
              size="sm"
            >
              {t("appDetail.acknowledge")}
            </Button>
          )}
          <Button
            disabled={isPending}
            onClick={() => act("RESOLVED")}
            size="sm"
          >
            {t("appDetail.markResolved")}
          </Button>
        </div>
      )}
    </li>
  );
}

export function ReportsPanel({
  kind,
  id,
}: {
  kind: "listing" | "agent";
  id: string;
}) {
  const { t } = useTranslation();
  const reports = useAppSelector(selectReports);

  if (reports.length === 0) {
    return (
      <EmptyState
        description={t("appDetail.noReportsBody")}
        icon={<ShieldAlert className="h-5 w-5" />}
        title={t("appDetail.noReports")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-muted text-sm">{t("appDetail.reportsLead")}</p>

      <ul className="flex flex-col border-overlay/10 border-t">
        {reports.map((report) => (
          <ReportRow id={id} key={report.id} kind={kind} report={report} />
        ))}
      </ul>
    </div>
  );
}
