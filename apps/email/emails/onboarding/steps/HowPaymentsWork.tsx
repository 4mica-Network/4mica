import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const HowPaymentsWork = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-how-payments-work">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="HTTP 402, one header, and a scheme called 4mica-credit"
  >
    <Heading style={styles.heading}>HTTP 402, put to work</Heading>

    <Text style={styles.paragraph}>
      {userName}, x402 revives the long-reserved HTTP 402 status code. A server
      answers an unpaid request with 402 and a description of what payment it
      wants; the client pays and retries with an X-PAYMENT header; the server
      verifies and serves.
    </Text>

    <Text style={styles.paragraph}>
      {brand.name} adds a payment scheme to that handshake, called{" "}
      <code>4mica-credit</code>. Instead of moving money on-chain per request,
      the buyer sends a signed promise backed by collateral. Verification takes
      milliseconds and costs no gas.
    </Text>

    <Text style={styles.paragraph}>
      If you already speak x402, this is not a new stack — it is one more scheme
      in the list you already advertise.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/core-concepts/how-x402-works`}
      label="Read how x402 works"
    />
  </Layout>
);

HowPaymentsWork.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-how-payments-work">;

export default HowPaymentsWork;
