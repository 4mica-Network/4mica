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

export const DisputeCreated = ({
  userName,
  disputeId,
  amount,
  reason,
  respondByAt,
  disputeUrl,
}: TemplateProps<"dispute-created">) => {
  const rows: DetailRow[] = [
    {
      label: "Disputed amount",
      value: formatMoney(amount.amount, amount.currency),
      tone: "negative",
    },
    { label: "Dispute", value: disputeId },
  ];

  if (reason) {
    rows.push({ label: "Reason", value: reason });
  }

  if (respondByAt) {
    rows.push({
      label: "Respond by",
      value: formatDate(respondByAt),
      tone: "negative",
    });
  }

  return (
    <Layout preview={`A dispute was opened on ${disputeId}`}>
      <Heading style={styles.heading}>A dispute was opened</Heading>

      <Text style={styles.paragraph}>
        {userName}, a payment of{" "}
        <strong>{formatMoney(amount.amount, amount.currency)}</strong> has been
        disputed. Submitting evidence early materially improves the outcome.
      </Text>

      <DetailList rows={rows} />

      <CallToAction href={disputeUrl} label="Review the dispute" />

      <Text style={styles.muted}>
        If you take no action before the deadline the dispute resolves in the
        counterparty's favour automatically.
      </Text>
    </Layout>
  );
};

DisputeCreated.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  disputeId: "dp_4m_01J8ZK",
  amount: { amount: 7_500, currency: "USD" },
  reason: "Service not rendered",
  respondByAt: "2026-08-20T00:00:00.000Z",
  disputeUrl: "https://app.4mica.io/disputes/preview",
} satisfies TemplateProps<"dispute-created">;

export default DisputeCreated;
