import type { TemplateProps } from "@4mica/email-client";
import { CallToAction, Layout, styles } from "@components/index";
import { Heading, Text } from "react-email";

export const FinancialAlert = ({
  userName,
  workspaceName,
  title,
  lines,
  dashboardUrl,
}: TemplateProps<"financial-alert">) => (
  <Layout preview={`${workspaceName}: ${title}`}>
    <Heading style={styles.heading}>{title}</Heading>

    <Text style={styles.paragraph}>
      Hi {userName}, this is a financial alert for the{" "}
      <strong>{workspaceName}</strong> workspace.
    </Text>

    {lines.map((line) => (
      <Text key={line} style={styles.paragraph}>
        {line}
      </Text>
    ))}

    <CallToAction href={dashboardUrl} label="Review in the dashboard" />

    <Text style={styles.muted}>
      You receive this because you are a finance recipient for this workspace.
      Spending policies are checked by agents that ask before they pay; they do
      not stop a payment made without asking.
    </Text>
  </Layout>
);

FinancialAlert.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  workspaceName: "Northwind Labs",
  title: "Daily budget 80% used",
  lines: ["Policy: Research agents", "Spent today: 80 of 100 USDC on Base"],
  dashboardUrl: "https://app.4mica.io/finance/alerts",
} satisfies TemplateProps<"financial-alert">;

export default FinancialAlert;
