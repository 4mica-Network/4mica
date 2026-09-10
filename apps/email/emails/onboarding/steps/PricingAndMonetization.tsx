import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const PricingAndMonetization = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-pricing-and-monetization">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Price per route, per call, in stablecoins"
  >
    <Heading style={styles.heading}>Pricing your API</Heading>

    <Text style={styles.paragraph}>
      {userName}, pricing is per route, so an expensive endpoint and a cheap one
      can sit in the same service without a pricing tier in sight.
    </Text>

    <Text style={styles.paragraph}>
      Because settlement is netted, the amount you can sensibly charge goes down
      a long way — pricing that would be eaten alive by per-transaction gas
      becomes workable.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/seller/pricing-and-monetization`}
      label="Read about pricing"
    />
  </Layout>
);

PricingAndMonetization.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-pricing-and-monetization">;

export default PricingAndMonetization;
