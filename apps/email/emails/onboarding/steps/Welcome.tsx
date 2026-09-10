import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const Welcome = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"welcome">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="The credit layer for the agentic economy"
  >
    <Heading style={styles.heading}>
      Welcome to {brand.name}, {userName}
    </Heading>

    <Text style={styles.paragraph}>
      {brand.name} is the credit and clearing layer for x402 payments. Your
      agents pay on credit against collateral you deposit once, requests clear
      off-chain in milliseconds, and balances settle net on-chain at the end of
      each cycle.
    </Text>

    <Text style={styles.paragraph}>
      That means thousands of API payments become one settlement instead of
      thousands of transactions — and your collateral earns yield while it sits
      there.
    </Text>

    <Text style={styles.paragraph}>
      Over the next few weeks we will walk you through the whole thing, one
      short email at a time. This first one just points you at the door.
    </Text>

    <CallToAction href={ctaUrl ?? brand.app} label="Open your dashboard" />
  </Layout>
);

Welcome.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"welcome">;

export default Welcome;
