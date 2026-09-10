import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const CollateralRatios = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-collateral-ratios">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="The relationship between what you deposit and what you can spend"
  >
    <Heading style={styles.heading}>Collateral ratios</Heading>

    <Text style={styles.paragraph}>
      {userName}, your credit line is a function of the collateral behind it.
      The ratio determines how much you can have outstanding at once, and it is
      what keeps the system solvent when somebody defaults.
    </Text>

    <Text style={styles.paragraph}>
      If your agents are hitting limits sooner than you expect, the ratio — not
      a spending cap — is usually the reason. It is worth understanding before
      you tune anything else.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/core-concepts/collateral-ratios`}
      label="Read about collateral ratios"
    />
  </Layout>
);

CollateralRatios.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-collateral-ratios">;

export default CollateralRatios;
