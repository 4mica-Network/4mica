import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  DetailList,
  formatDate,
  Layout,
  styles,
} from "@components/index";
import { Heading, Text } from "react-email";

const changeLabel = (change: number | undefined): string => {
  if (change === undefined) {
    return "";
  }

  return ` (${change >= 0 ? "+" : ""}${change}%)`;
};

export const WeeklyReport = ({
  userName,
  periodStart,
  periodEnd,
  summary,
  metrics,
  dashboardUrl,
}: TemplateProps<"weekly-report">) => (
  <Layout preview={`Your ${brand.name} week: ${summary}`}>
    <Heading style={styles.heading}>Your week on {brand.name}</Heading>

    <Text style={styles.muted}>
      {formatDate(periodStart)} — {formatDate(periodEnd)}
    </Text>

    <Text style={styles.paragraph}>
      {userName}, {summary}
    </Text>

    {metrics.length > 0 ? (
      <DetailList
        rows={metrics.map((metric) => ({
          label: metric.label,
          value: `${metric.value}${changeLabel(metric.change)}`,
          tone:
            metric.change === undefined || metric.change === 0
              ? undefined
              : metric.change > 0
                ? "positive"
                : "negative",
        }))}
      />
    ) : null}

    {dashboardUrl ? (
      <CallToAction href={dashboardUrl} label="Open the dashboard" />
    ) : null}
  </Layout>
);

WeeklyReport.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  periodStart: "2026-08-03T00:00:00.000Z",
  periodEnd: "2026-08-09T23:59:59.000Z",
  summary: "your agents settled 1,284 transactions with no disputes.",
  metrics: [
    { label: "Transactions", value: "1,284", change: 12.5 },
    { label: "Settled volume", value: "$48,210", change: 8 },
    { label: "Disputes", value: "0", change: -100 },
    { label: "Active agents", value: "6" },
  ],
  dashboardUrl: "https://app.4mica.io",
} satisfies TemplateProps<"weekly-report">;

export default WeeklyReport;
