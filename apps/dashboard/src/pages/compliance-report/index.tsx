import { EmptyState, Tag } from "@4mica/ui";
import { downloadComplianceCsv, downloadComplianceJson } from "@api/security";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  selectActiveOrganization,
  selectCan,
} from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import {
  fetchComplianceReport,
  selectComplianceReport,
  selectComplianceReportError,
  selectComplianceReportStatus,
} from "@stores/security";
import type {
  CheckStatus,
  ComplianceApiKey,
  ComplianceReport,
} from "@stores/security/type";
import { formatDate } from "@utils/format";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ExportCsvButton } from "@/components/ExportCsv";
import { Cell, Table } from "@/components/Finance/Table";
import { SectionCard } from "@/components/layout";
import { PageSpinner } from "@/components/PageSpinner";
import { Unavailable } from "@/components/SecurityNotice";
import { SettingsPage } from "@/components/SettingsPage";

const CHECK_TONE: Record<
  CheckStatus,
  { variant: "success" | "warning" | "error"; icon: ReactNode }
> = {
  pass: {
    variant: "success",
    icon: <CircleCheck aria-hidden="true" className="h-4 w-4 text-success" />,
  },
  warn: {
    variant: "warning",
    icon: <TriangleAlert aria-hidden="true" className="h-4 w-4 text-warning" />,
  },
  fail: {
    variant: "error",
    icon: <CircleX aria-hidden="true" className="h-4 w-4 text-danger" />,
  },
};

export const humanize = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (first) => first.toUpperCase());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "✓" : "✗";
  }
  if (Array.isArray(value)) {
    return value.every((item) => !isRecord(item))
      ? value.map(formatValue).join(", ") || "—"
      : String(value.length);
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${humanize(key)}: ${formatValue(item)}`)
      .join(" · ");
  }
  return String(value);
};

function Summary({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex flex-col">
          <dt className="text-ink-subtle text-xs">{humanize(key)}</dt>
          <dd className="break-words text-ink-body">{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

const SECTIONS = ["identity", "access", "financial", "logging"] as const;

export const countChecks = (report: ComplianceReport) => ({
  pass: report.checks.filter((check) => check.status === "pass").length,
  warn: report.checks.filter((check) => check.status === "warn").length,
  fail: report.checks.filter((check) => check.status === "fail").length,
});

const accountName = (key: ComplianceApiKey) =>
  typeof key.serviceAccount === "string"
    ? key.serviceAccount
    : (key.serviceAccount?.name ?? "—");

function Report({ report }: { report: ComplianceReport }) {
  const { t } = useTranslation();
  const counts = countChecks(report);
  const { apiKeys, ...credentials } = report.credentials;

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title={t("security.report.checks")}
        description={t("security.report.generated", {
          date: formatDate(report.generatedAt),
        })}
        data-testid="report-checks"
        action={
          <div className="flex items-center gap-1.5">
            <Tag size="sm" variant="success">
              {t("security.report.passCount", { count: counts.pass })}
            </Tag>
            <Tag size="sm" variant="warning">
              {t("security.report.warnCount", { count: counts.warn })}
            </Tag>
            <Tag size="sm" variant="error">
              {t("security.report.failCount", { count: counts.fail })}
            </Tag>
          </div>
        }
      >
        <ul className="flex flex-col divide-y divide-overlay/10">
          {report.checks.map((check) => (
            <li
              key={check.id}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              data-testid={`check-${check.id}`}
            >
              <span className="mt-0.5 shrink-0">
                {CHECK_TONE[check.status].icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink-strong text-sm">
                    {check.title}
                  </span>
                  <Tag size="sm" variant={CHECK_TONE[check.status].variant}>
                    {t(`security.report.status.${check.status}`)}
                  </Tag>
                </div>
                <p className="mt-0.5 text-ink-muted text-xs">{check.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      {SECTIONS.map((section) =>
        isRecord(report[section]) ? (
          <SectionCard
            key={section}
            title={t(`security.report.section.${section}`)}
            data-testid={`report-${section}`}
          >
            <Summary data={report[section]} />
          </SectionCard>
        ) : null,
      )}

      <SectionCard
        title={t("security.report.section.credentials")}
        data-testid="report-credentials"
      >
        <Summary data={credentials} />
        {apiKeys.length === 0 ? (
          <p className="text-ink-muted text-sm">
            {t("security.report.noKeys")}
          </p>
        ) : (
          <Table
            columns={[
              { label: t("security.report.key.name") },
              { label: t("security.report.key.environment") },
              { label: t("security.report.key.serviceAccount") },
              { label: t("security.report.key.age"), align: "right" },
              { label: t("security.report.key.lastUsed") },
              { label: t("security.report.key.expires") },
              { label: t("security.report.key.ip") },
            ]}
            data-testid="report-api-keys"
          >
            {apiKeys.map((key) => (
              <tr key={key.id} data-testid={`report-key-${key.id}`}>
                <Cell>
                  <span className="font-medium text-ink-strong">
                    {key.name}
                  </span>
                  <span className="block text-ink-subtle text-xs">
                    {key.scopes.join(", ")}
                  </span>
                </Cell>
                <Cell>{key.environment}</Cell>
                <Cell>{accountName(key)}</Cell>
                <Cell align="right">
                  {t("security.report.key.days", { count: key.ageDays })}
                </Cell>
                <Cell>{formatDate(key.lastUsedAt)}</Cell>
                <Cell>{formatDate(key.expiresAt)}</Cell>
                <Cell>
                  <Tag
                    size="sm"
                    variant={key.ipRestricted ? "success" : "neutral"}
                  >
                    {key.ipRestricted
                      ? t("security.report.key.restricted")
                      : t("security.report.key.open")}
                  </Tag>
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </SectionCard>
    </div>
  );
}

function ReportContent() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const report = useAppSelector(selectComplianceReport);
  const status = useAppSelector(selectComplianceReportStatus);
  const error = useAppSelector(selectComplianceReportError);

  useEffect(() => {
    dispatch(fetchComplianceReport());
  }, [dispatch]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ExportCsvButton
          label={t("security.report.downloadJson")}
          onExport={downloadComplianceJson}
          data-testid="report-download-json"
        />
        <ExportCsvButton
          label={t("security.report.downloadCsv")}
          onExport={downloadComplianceCsv}
          data-testid="report-download-csv"
        />
      </div>
      {status === "failed" && !report ? (
        <EmptyState
          icon={<TriangleAlert className="h-5 w-5" />}
          title={t("security.report.loadFailed")}
          description={error ?? undefined}
          action={{
            label: t("security.retry"),
            onClick: () => dispatch(fetchComplianceReport()),
          }}
          data-testid="report-error"
        />
      ) : report ? (
        <Report report={report} />
      ) : (
        <PageSpinner />
      )}
    </>
  );
}

export function ComplianceReportSettings() {
  const organization = useAppSelector(selectActiveOrganization);
  const canRead = useAppSelector(selectCan(PERMISSION.COMPLIANCE_READ));

  return (
    <SettingsPage
      titleKey="page.settings.complianceReport.title"
      descriptionKey="page.settings.complianceReport.description"
    >
      {!canRead || organization?.personal ? (
        <Unavailable
          personal={Boolean(organization?.personal)}
          testId="report-unavailable"
        />
      ) : (
        <ReportContent />
      )}
    </SettingsPage>
  );
}
