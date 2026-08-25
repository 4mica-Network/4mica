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

export const PayoutPaid = ({
  userName,
  payoutId,
  amount,
  paidAt,
  destination,
  dashboardUrl,
}: TemplateProps<"payout-paid">) => {
  const rows: DetailRow[] = [
    {
      label: "Amount",
      value: formatMoney(amount.amount, amount.currency),
      tone: "positive",
    },
    { label: "Sent", value: formatDate(paidAt) },
    { label: "Payout", value: payoutId },
  ];

  if (destination) {
    rows.splice(2, 0, { label: "Destination", value: destination });
  }

  return (
    <Layout
      preview={`Payout of ${formatMoney(amount.amount, amount.currency)} is on its way`}
    >
      <Heading style={styles.heading}>Your payout is on its way</Heading>

      <Text style={styles.paragraph}>
        {userName}, we've sent{" "}
        <strong>{formatMoney(amount.amount, amount.currency)}</strong> to your
        payout destination. Settlement times depend on the receiving network.
      </Text>

      <DetailList rows={rows} />

      {dashboardUrl ? (
        <CallToAction href={dashboardUrl} label="View payouts" />
      ) : null}
    </Layout>
  );
};

PayoutPaid.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  payoutId: "po_4m_01J8ZK",
  amount: { amount: 128_400, currency: "USD" },
  paidAt: "2026-08-08T11:30:00.000Z",
  destination: "USDC · Base",
  dashboardUrl: "https://app.4mica.io/payouts",
} satisfies TemplateProps<"payout-paid">;

export default PayoutPaid;
