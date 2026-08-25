import type { TemplateProps } from "@4mica/email-client";
import {
  CallToAction,
  DetailList,
  type DetailRow,
  formatDate,
  formatMoney,
  Layout,
  styles,
} from "@components/index";
import { Heading, Text } from "react-email";

export const SubscriptionRenewed = ({
  userName,
  planName,
  renewedAt,
  nextInvoiceDate,
  amount,
  manageBillingUrl,
}: TemplateProps<"subscription-renewed">) => {
  const rows: DetailRow[] = [
    { label: "Plan", value: planName },
    { label: "Renewed", value: formatDate(renewedAt) },
  ];

  if (amount) {
    rows.push({
      label: "Charged",
      value: formatMoney(amount.amount, amount.currency),
    });
  }

  if (nextInvoiceDate) {
    rows.push({ label: "Next invoice", value: formatDate(nextInvoiceDate) });
  }

  return (
    <Layout preview={`Your ${planName} plan renewed`}>
      <Heading style={styles.heading}>Your plan renewed</Heading>

      <Text style={styles.paragraph}>
        Thanks {userName} — your <strong>{planName}</strong> subscription is
        active for another term and nothing changes for your agents.
      </Text>

      <DetailList rows={rows} />

      <CallToAction href={manageBillingUrl} label="View billing" />
    </Layout>
  );
};

SubscriptionRenewed.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  planName: "Scale",
  renewedAt: "2026-08-01T00:00:00.000Z",
  nextInvoiceDate: "2026-09-01T00:00:00.000Z",
  amount: { amount: 9_900, currency: "USD" },
  manageBillingUrl: "https://app.4mica.io/billing",
} satisfies TemplateProps<"subscription-renewed">;

export default SubscriptionRenewed;
