import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const BusinessAndKyb = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-business-and-kyb">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Legal entity, address, tax details — required before payouts"
  >
    <Heading style={styles.heading}>
      Business and verification, {userName}
    </Heading>

    <Text style={styles.paragraph}>
      Settings → Business holds your legal entity: registered name, business
      type, registration and tax numbers, address, and the support email and
      phone your customers will see.
    </Text>

    <Text style={styles.paragraph}>
      It also carries your KYB status, which moves from Unverified to Pending to
      Verified (or Rejected). Verification is required before you can receive
      payouts, and it is the step most likely to hold up a launch — so start it
      early rather than the week you go live.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.app}/settings/business`}
      label="Complete your business profile"
    />
  </Layout>
);

BusinessAndKyb.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-business-and-kyb">;

export default BusinessAndKyb;
