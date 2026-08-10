import type { TemplateProps } from "@4mica/email-client";
import {
  CallToAction,
  DetailList,
  formatDate,
  Layout,
  styles,
} from "@components/index";
import { Heading, Text } from "react-email";

export const SubscriptionExpiration = ({
  userName,
  planName,
  expiresAt,
  manageBillingUrl,
}: TemplateProps<"subscription-expiration">) => (
  <Layout preview={`Your ${planName} plan expires ${formatDate(expiresAt)}`}>
    <Heading style={styles.heading}>Your plan is about to expire</Heading>

    <Text style={styles.paragraph}>
      {userName}, your <strong>{planName}</strong> subscription ends on{" "}
      {formatDate(expiresAt)}. After that your agents keep their configuration
      but stop transacting, so it's worth renewing before then.
    </Text>

    <DetailList
      rows={[
        { label: "Plan", value: planName },
        { label: "Expires", value: formatDate(expiresAt), tone: "negative" },
      ]}
    />

    <CallToAction href={manageBillingUrl} label="Manage billing" />
  </Layout>
);

SubscriptionExpiration.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  planName: "Scale",
  expiresAt: "2026-09-01T00:00:00.000Z",
  manageBillingUrl: "https://app.4mica.io/billing",
} satisfies TemplateProps<"subscription-expiration">;

export default SubscriptionExpiration;
