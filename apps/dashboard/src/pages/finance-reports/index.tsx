import { shortenAddress, trimAmount } from "@4mica/rules";
import { Card, Segmented } from "@4mica/ui";
import { exportPayments, exportUsage } from "@api/exports";
import {
  type FinanceReport,
  fetchReport,
  selectReports,
  setReportOptions,
} from "@stores/finance";
import { rangeParams } from "@stores/finance/saga";
import {
  type TokenTotal,
  USAGE_GROUPS,
  type UsageDirection,
  type UsageGroup,
} from "@stores/finance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectCan } from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import { formatDateTime } from "@utils/format";
import { BarChart3, Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExportCsvButton } from "@/components/ExportCsv";
import { FinancePage } from "@/components/Finance/FinancePage";
import { ListState } from "@/components/Finance/ListState";
import { Cell, Table } from "@/components/Finance/Table";
import { tokenKey, tokenLabel } from "@/components/Finance/token";
import { Select, TextInput } from "@/components/form";
import { Masked } from "@/components/Masked";

type Tab = "usage" | "reconciliation";

function Totals({
  title,
  totals,
  testId,
}: {
  title: string;
  totals: TokenTotal[];
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col gap-2 px-4 py-3.5" data-testid={testId}>
      <span className="text-ink-subtle text-xs uppercase tracking-wide">
        {title}
      </span>
      {totals.length === 0 ? (
        <span className="font-semibold text-ink-strong text-xl">—</span>
      ) : (
        totals.map((total) => (
          <span
            key={tokenKey(total.network, total.assetAddress)}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="font-mono font-semibold text-ink-strong text-lg tabular-nums">
              <Masked>{trimAmount(total.amount)}</Masked>{" "}
              <span className="font-normal text-ink-subtle text-xs">
                {tokenLabel(total.network, total.assetAddress)}
              </span>
            </span>
            <span className="text-ink-muted text-xs">
              {t("finance.reports.payments", { count: total.count })}
            </span>
          </span>
        ))
      )}
    </Card>
  );
}

function Summary() {
  const { t } = useTranslation();
  const { summary } = useAppSelector(selectReports);
  if (!summary) {
    return null;
  }
  const checks = summary.authorizations;
  return (
    <div className="grid gap-3 md:grid-cols-3" data-testid="report-summary">
      <Totals
        title={t("finance.reports.sent")}
        totals={summary.sent}
        testId="report-sent"
      />
      <Totals
        title={t("finance.reports.received")}
        totals={summary.received}
        testId="report-received"
      />
      <Card
        className="flex flex-col gap-2 px-4 py-3.5"
        data-testid="report-checks"
      >
        <span className="text-ink-subtle text-xs uppercase tracking-wide">
          {t("finance.reports.checks")}
        </span>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {(
            [
              ["consumed", checks.consumed],
              ["reserved", checks.reserved],
              ["pendingApproval", checks.pendingApproval],
              ["denied", checks.denied],
              ["released", checks.released],
              ["expired", checks.expired],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="text-ink-muted">
                {t(`finance.reports.check.${key}`)}
              </dt>
              <dd className="text-ink-body tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function Usage({ canExport }: { canExport: boolean }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const reports = useAppSelector(selectReports);

  const choose = (next: {
    groupBy?: UsageGroup;
    direction?: UsageDirection;
  }) => {
    dispatch(setReportOptions(next));
    dispatch(fetchReport("usage"));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Select
            id="report-group-by"
            aria-label={t("finance.reports.groupBy")}
            value={reports.groupBy}
            options={USAGE_GROUPS.map((group) => ({
              value: group,
              title: t(`finance.reports.group.${group}`),
            }))}
            onChange={(value) => choose({ groupBy: value as UsageGroup })}
          />
        </div>
        <Segmented<UsageDirection>
          label={t("finance.reports.direction")}
          value={reports.direction}
          options={[
            { value: "sent", label: t("finance.reports.sent") },
            { value: "received", label: t("finance.reports.received") },
          ]}
          onChange={(direction) => choose({ direction })}
          data-testid="report-direction"
        />
        {canExport && (
          <div className="ml-auto">
            <ExportCsvButton
              label={t("finance.reports.exportUsage")}
              onExport={() =>
                exportUsage({
                  ...rangeParams(reports.range),
                  groupBy: reports.groupBy,
                  direction: reports.direction,
                })
              }
              data-testid="export-usage"
            />
          </div>
        )}
      </div>
      <ListState
        status={reports.usageStatus}
        error={reports.error}
        isEmpty={reports.usage.length === 0}
        empty={{
          icon: <BarChart3 className="h-5 w-5" />,
          title: t("finance.reports.usageEmpty"),
        }}
        onRetry={() => dispatch(fetchReport("usage"))}
        data-testid="report-usage"
      >
        <Table
          columns={[
            { label: t(`finance.reports.group.${reports.groupBy}`) },
            { label: t("finance.reports.token") },
            { label: t("finance.reports.amount"), align: "right" },
            { label: t("finance.reports.count"), align: "right" },
          ]}
          data-testid="usage-table"
        >
          {reports.usage.map((row) => (
            <tr
              key={`${row.key ?? "none"}-${tokenKey(row.network, row.assetAddress)}`}
              className="bg-surface"
            >
              <Cell>
                {row.key === null
                  ? t("finance.reports.unattributed")
                  : row.label}
              </Cell>
              <Cell className="text-ink-muted text-xs">
                {tokenLabel(row.network, row.assetAddress)}
              </Cell>
              <Cell align="right" className="tabular-nums">
                <Masked>{trimAmount(row.amount)}</Masked>
              </Cell>
              <Cell align="right" className="tabular-nums">
                {row.count}
              </Cell>
            </tr>
          ))}
        </Table>
      </ListState>
    </div>
  );
}

function ReconciliationView() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { reconciliation, reconciliationStatus, error } =
    useAppSelector(selectReports);
  const authorized = reconciliation?.authorizedNotReported ?? [];
  const reported = reconciliation?.reportedNotAuthorized ?? [];

  return (
    <ListState
      status={reconciliationStatus}
      error={error}
      isEmpty={false}
      empty={{ icon: <Scale className="h-5 w-5" />, title: "" }}
      onRetry={() => dispatch(fetchReport("reconciliation"))}
      data-testid="report-reconciliation"
    >
      <div className="flex flex-col gap-6">
        <p className="text-ink-muted text-sm">
          {t("finance.reports.matched", {
            count: reconciliation?.matched ?? 0,
          })}
        </p>
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold text-ink-strong text-sm">
            {t("finance.reports.authorizedNotReported")}
          </h3>
          <p className="text-ink-muted text-xs">
            {t("finance.reports.authorizedNotReportedHint")}
          </p>
          {authorized.length === 0 ? (
            <p className="text-ink-subtle text-sm">
              {t("finance.reports.nothing")}
            </p>
          ) : (
            <Table
              columns={[
                { label: t("finance.reports.amount") },
                { label: t("finance.reports.status") },
                { label: t("finance.reports.expires"), align: "right" },
              ]}
              data-testid="authorized-not-reported"
            >
              {authorized.map((item) => (
                <tr key={item.id} className="bg-surface">
                  <Cell className="tabular-nums">
                    <Masked>{trimAmount(item.amount)}</Masked>{" "}
                    <span className="text-ink-subtle text-xs">
                      {tokenLabel(item.network, item.assetAddress)}
                    </span>
                  </Cell>
                  <Cell>{t(`finance.authorizationStatus.${item.status}`)}</Cell>
                  <Cell align="right" className="text-ink-muted text-xs">
                    {formatDateTime(item.expiresAt)}
                  </Cell>
                </tr>
              ))}
            </Table>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold text-ink-strong text-sm">
            {t("finance.reports.reportedNotAuthorized")}
          </h3>
          <p className="text-ink-muted text-xs">
            {t("finance.reports.reportedNotAuthorizedHint")}
          </p>
          {reported.length === 0 ? (
            <p className="text-ink-subtle text-sm">
              {t("finance.reports.nothing")}
            </p>
          ) : (
            <Table
              columns={[
                { label: t("finance.reports.amount") },
                { label: t("finance.reports.recipient") },
                { label: t("finance.reports.time"), align: "right" },
              ]}
              data-testid="reported-not-authorized"
            >
              {reported.map((payment) => (
                <tr key={payment.id} className="bg-surface">
                  <Cell className="tabular-nums">
                    <Masked>{trimAmount(payment.amount)}</Masked>{" "}
                    <span className="text-ink-subtle text-xs">
                      {tokenLabel(payment.network, payment.assetAddress)}
                    </span>
                  </Cell>
                  <Cell className="font-mono text-xs">
                    {shortenAddress(payment.recipientAddress)}
                  </Cell>
                  <Cell align="right" className="text-ink-muted text-xs">
                    {formatDateTime(payment.createdAt)}
                  </Cell>
                </tr>
              ))}
            </Table>
          )}
        </section>
      </div>
    </ListState>
  );
}

const ALL_REPORTS: FinanceReport[] = ["summary", "usage", "reconciliation"];

export function FinanceReports() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const reports = useAppSelector(selectReports);
  const canExport = useAppSelector(selectCan(PERMISSION.REPORTS_EXPORT));
  const [tab, setTab] = useState<Tab>("usage");

  useEffect(() => {
    for (const report of ALL_REPORTS) {
      dispatch(fetchReport(report));
    }
  }, [dispatch]);

  const setRange = (next: { from?: string; to?: string }) => {
    const range = { ...reports.range, ...next };
    if (!range.from || !range.to || range.from > range.to) {
      return;
    }
    dispatch(setReportOptions({ range }));
    for (const report of ALL_REPORTS) {
      dispatch(fetchReport(report));
    }
  };

  return (
    <FinancePage
      titleKey="finance.reports.title"
      descriptionKey="finance.reports.description"
      action={
        canExport && (
          <div className="flex flex-wrap gap-2">
            <ExportCsvButton
              label={t("finance.reports.exportSent")}
              onExport={() =>
                exportPayments({
                  ...rangeParams(reports.range),
                  direction: "sent",
                })
              }
              data-testid="export-sent"
            />
            <ExportCsvButton
              label={t("finance.reports.exportReceived")}
              onExport={() =>
                exportPayments({
                  ...rangeParams(reports.range),
                  direction: "received",
                })
              }
              data-testid="export-received"
            />
          </div>
        )
      }
    >
      <div className="flex flex-col gap-6">
        <div
          className="flex flex-wrap items-end gap-3"
          data-testid="report-range"
        >
          <div className="w-44">
            <TextInput
              type="date"
              aria-label={t("finance.filter.from")}
              value={reports.range.from}
              onChange={(from) => setRange({ from })}
            />
          </div>
          <div className="w-44">
            <TextInput
              type="date"
              aria-label={t("finance.filter.to")}
              value={reports.range.to}
              onChange={(to) => setRange({ to })}
            />
          </div>
        </div>

        <Summary />

        <div className="flex flex-col gap-4">
          <Segmented<Tab>
            label={t("finance.reports.view")}
            value={tab}
            options={[
              { value: "usage", label: t("finance.reports.usageTab") },
              {
                value: "reconciliation",
                label: t("finance.reports.reconciliationTab"),
              },
            ]}
            onChange={setTab}
            data-testid="report-tab"
          />
          {tab === "usage" ? (
            <Usage canExport={canExport} />
          ) : (
            <ReconciliationView />
          )}
        </div>
      </div>
    </FinancePage>
  );
}
