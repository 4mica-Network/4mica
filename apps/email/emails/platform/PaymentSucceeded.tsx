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

export const PaymentSucceeded = ({
  userName,
  paymentId,
  amount,
  paidAt,
  agentName,
  receiptUrl,
}: TemplateProps<"payment-succeeded">) => {
  const rows: DetailRow[] = [
    {
      label: "Amount",
      value: formatMoney(amount.amount, amount.currency),
      tone: "positive",
    },
    { label: "Paid", value: formatDate(paidAt) },
    { label: "Payment", value: paymentId },
  ];

  if (agentName) {
    rows.splice(2, 0, { label: "Agent", value: agentName });
  }

  return (
    <Layout
      preview={`Payment of ${formatMoney(amount.amount, amount.currency)} succeeded`}
    >
      <Heading style={styles.heading}>Payment succeeded</Heading>

      <Text style={styles.paragraph}>
        {userName}, a payment of{" "}
        <strong>{formatMoney(amount.amount, amount.currency)}</strong> settled
        {agentName ? ` for ${agentName}` : ""}.
      </Text>

      <DetailList rows={rows} />

      {receiptUrl ? (
        <CallToAction href={receiptUrl} label="View receipt" />
      ) : null}
    </Layout>
  );
};

PaymentSucceeded.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  paymentId: "pay_4m_01J8ZK",
  amount: { amount: 4_250, currency: "USD" },
  paidAt: "2026-08-09T14:02:00.000Z",
  agentName: "research-scout",
  receiptUrl: "https://app.4mica.io/payments/preview",
} satisfies TemplateProps<"payment-succeeded">;

export default PaymentSucceeded;
