import type { TemplateProps } from "@4mica/email-client";
import {
  CallToAction,
  DetailList,
  formatDate,
  formatMoney,
  Layout,
  styles,
} from "@components/index";
import { Heading, Text } from "react-email";

export const CreditLimitChanged = ({
  userName,
  previousLimit,
  newLimit,
  effectiveAt,
  dashboardUrl,
}: TemplateProps<"credit-limit-changed">) => {
  const increased = newLimit.amount > previousLimit.amount;

  return (
    <Layout
      preview={`Your credit limit is now ${formatMoney(newLimit.amount, newLimit.currency)}`}
    >
      <Heading style={styles.heading}>
        Your credit limit {increased ? "increased" : "changed"}
      </Heading>

      <Text style={styles.paragraph}>
        {userName}, the credit limit on your account is now{" "}
        <strong>{formatMoney(newLimit.amount, newLimit.currency)}</strong>,
        effective {formatDate(effectiveAt)}. Your agents can spend up to this
        amount before settlement.
      </Text>

      <DetailList
        rows={[
          {
            label: "Previous limit",
            value: formatMoney(previousLimit.amount, previousLimit.currency),
          },
          {
            label: "New limit",
            value: formatMoney(newLimit.amount, newLimit.currency),
            tone: increased ? "positive" : "negative",
          },
          { label: "Effective", value: formatDate(effectiveAt) },
        ]}
      />

      {dashboardUrl ? (
        <CallToAction href={dashboardUrl} label="View your limits" />
      ) : null}
    </Layout>
  );
};

CreditLimitChanged.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  previousLimit: { amount: 500_000, currency: "USD" },
  newLimit: { amount: 1_500_000, currency: "USD" },
  effectiveAt: "2026-08-10T00:00:00.000Z",
  dashboardUrl: "https://app.4mica.io/credit",
} satisfies TemplateProps<"credit-limit-changed">;

export default CreditLimitChanged;
