import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const Settlements = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-settlements">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Net debtors pay once, creditors claim once"
  >
    <Heading style={styles.heading}>Settlement</Heading>

    <Text style={styles.paragraph}>
      {userName}, when a cycle closes, net positions are committed on-chain. Net
      debtors pay their position; net creditors claim theirs. Both are proved
      against the committed set, so nobody has to trust the arithmetic — they
      can check it.
    </Text>

    <Text style={styles.paragraph}>
      Payment and finality windows follow, and defaults are covered by the
      defaulter's collateral. That is the point of requiring collateral in the
      first place.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/core-concepts/settlements`}
      label="Read about settlements"
    />
  </Layout>
);

Settlements.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-settlements">;

export default Settlements;
