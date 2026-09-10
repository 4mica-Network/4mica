import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const TransactionLifecycle = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-transaction-lifecycle">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Guarantee, certificate, cycle, settlement"
  >
    <Heading style={styles.heading}>One payment, end to end</Heading>

    <Text style={styles.paragraph}>
      {userName}, a buyer signs an EIP-712 payment guarantee that binds the
      payer, recipient, amount, asset and request id. It travels in the
      X-PAYMENT header.
    </Text>

    <Text style={styles.paragraph}>
      Core checks the buyer has credit and returns a BLS certificate — the proof
      the guarantee was accepted. The seller verifies that and serves the
      request. No chain write has happened yet.
    </Text>

    <Text style={styles.paragraph}>
      Guarantees accumulate through the clearing cycle. When the cycle closes
      they are netted, and only the net positions are committed on-chain.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/core-concepts/transaction-lifecycle`}
      label="Read the lifecycle"
    />
  </Layout>
);

TransactionLifecycle.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-transaction-lifecycle">;

export default TransactionLifecycle;
