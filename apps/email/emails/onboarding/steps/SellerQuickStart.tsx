import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const SellerQuickStart = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-seller-quick-start">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Put a price on an endpoint and get paid per call"
  >
    <Heading style={styles.heading}>Selling with x402</Heading>

    <Text style={styles.paragraph}>
      {userName}, on the selling side you put a price on a route, verify payment
      before doing the work, and get paid each cycle. No signup funnel, no
      subscription, no invoicing — the caller pays per call.
    </Text>

    <Text style={styles.paragraph}>
      The seller quick start walks through protecting one endpoint end to end.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/seller/quick-start`}
      label="Start the seller guide"
    />
  </Layout>
);

SellerQuickStart.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-seller-quick-start">;

export default SellerQuickStart;
