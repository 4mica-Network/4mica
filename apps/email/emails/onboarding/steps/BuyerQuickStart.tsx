import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const BuyerQuickStart = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-buyer-quick-start">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="From nothing to a paid API call"
  >
    <Heading style={styles.heading}>Your first paid request</Heading>

    <Text style={styles.paragraph}>
      {userName}, the buyer quick start takes you from an empty project to a
      successful paid call. You configure a client, point it at a facilitator,
      and let it handle the 402 handshake for you.
    </Text>

    <Text style={styles.paragraph}>
      It runs against a testnet, so nothing costs real money while you are
      finding your footing.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/buyer/quick-start`}
      label="Start the buyer guide"
    />
  </Layout>
);

BuyerQuickStart.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-buyer-quick-start">;

export default BuyerQuickStart;
