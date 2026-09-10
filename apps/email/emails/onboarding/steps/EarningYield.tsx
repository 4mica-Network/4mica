import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const EarningYield = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-earning-yield">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Stablecoin collateral is supplied to Aave while it backs credit"
  >
    <Heading style={styles.heading}>Earning yield on collateral</Heading>

    <Text style={styles.paragraph}>
      {userName}, stablecoin collateral is supplied to Aave, and the protocol
      holds the interest-bearing tokens. Yield accrues to the payer's collateral
      position — the person who put the money up — not to the seller.
    </Text>

    <Text style={styles.paragraph}>
      So the capital you set aside to back credit is not dead capital. Worth
      saying plainly, though: the rate is variable and not guaranteed. Treat it
      as an offset to your cost of capital, not as income you can forecast.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/core-concepts/earning-yield`}
      label="Read about yield"
    />
  </Layout>
);

EarningYield.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-earning-yield">;

export default EarningYield;
