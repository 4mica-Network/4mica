import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  Signature,
  sender,
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
    preview="Payment infrastructure for accepting payments per call"
  >
    <Heading style={styles.heading}>
      Welcome to {brand.name}, {userName}
    </Heading>

    <Text style={styles.paragraph}>
      I am {sender.firstName}, one of the founders here, and I work on the
      protocol. I wanted to tell you what you have just signed up for before
      anything else lands in your inbox.
    </Text>

    <Text style={styles.paragraph}>
      {brand.name} is payment infrastructure. You use it to accept payments —
      per API call, per request, in stablecoins, from your customers and from
      the agents acting on their behalf.
    </Text>

    <Text style={styles.paragraph}>
      The interesting part is underneath. Payments clear off-chain in
      milliseconds and settle net on-chain once per cycle, so you are not paying
      a transaction fee on every call. That is what makes charging a fraction of
      a cent per request a real option rather than a thought experiment.
    </Text>

    <Text style={styles.paragraph}>
      Over the next few weeks I will teach you the rest of it, one short email
      at a time.
    </Text>

    <Signature />

    <CallToAction href={ctaUrl ?? brand.app} label="Open your dashboard" />
  </Layout>
);

Welcome.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"welcome">;

export default Welcome;
