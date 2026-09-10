import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const NoCustodialRisk = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-no-custodial-risk">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Your collateral is in protocol contracts, not our account"
  >
    <Heading style={styles.heading}>Non-custodial by design</Heading>

    <Text style={styles.paragraph}>
      {userName}, your collateral sits in protocol contracts. Your guarantees
      are on-chain. {brand.name} is the coordination layer between them, and it
      has no ability to move your money.
    </Text>

    <Text style={styles.paragraph}>
      This is a design decision rather than a policy: trust is enforced by
      contracts and cryptography, so it does not depend on us behaving well,
      staying solvent, or continuing to exist.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/core-concepts/no-custodial-risk`}
      label="Read the custody model"
    />
  </Layout>
);

NoCustodialRisk.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-no-custodial-risk">;

export default NoCustodialRisk;
