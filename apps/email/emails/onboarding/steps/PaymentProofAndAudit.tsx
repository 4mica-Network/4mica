import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const PaymentProofAndAudit = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-payment-proof-and-audit">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Every payment leaves a verifiable record"
  >
    <Heading style={styles.heading}>Proof and audit</Heading>

    <Text style={styles.paragraph}>
      {userName}, every payment produces a record you can verify independently:
      a signed guarantee, the certificate that accepted it, and the settlement
      that cleared it.
    </Text>

    <Text style={styles.paragraph}>
      That matters for reconciliation, for disputes, and for the ordinary
      business of explaining to someone else where the money went.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/buyer/payment-proof-and-audit`}
      label="Read about payment proof"
    />
  </Layout>
);

PaymentProofAndAudit.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-payment-proof-and-audit">;

export default PaymentProofAndAudit;
