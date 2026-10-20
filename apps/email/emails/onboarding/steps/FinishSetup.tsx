import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const FinishSetup = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-finish-setup">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="An API key, a webhook endpoint, and a verified business"
  >
    <Heading style={styles.heading}>
      Finish your integration, {userName}
    </Heading>

    <Text style={styles.paragraph}>
      If you do nothing else this week, do these three. They are all under
      Settings, and together they are the whole gap between an account and an
      endpoint that takes money:
    </Text>

    <Text style={styles.paragraph}>
      <strong>1. Create an API key</strong>, so you can authenticate your first
      request. <strong>2. Add a webhook endpoint</strong>, so you know when
      payments settle. <strong>3. Verify your business</strong>, which is
      required before you can receive payouts.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.app}/settings/developer`}
      label="Open developer settings"
    />
  </Layout>
);

FinishSetup.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-finish-setup">;

export default FinishSetup;
