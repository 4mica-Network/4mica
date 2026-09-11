import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const ProofAndDisputes = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-proof-and-disputes">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Evidence, and how a dispute resolves"
  >
    <Heading style={styles.heading}>Disputes</Heading>

    <Text style={styles.paragraph}>
      {userName}, disputes happen. The useful thing is that both sides hold
      cryptographic evidence of what was agreed: a signed guarantee naming the
      amount, the recipient and the specific request.
    </Text>

    <Text style={styles.paragraph}>
      The disputes guide covers what evidence to keep, how resolution works, and
      how to prevent the avoidable cases in the first place.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/seller/proof-and-disputes`}
      label="Read about disputes"
    />
  </Layout>
);

ProofAndDisputes.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-proof-and-disputes">;

export default ProofAndDisputes;
