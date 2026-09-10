import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const Webhooks = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-webhooks">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Payments, payouts, disputes, agents, credit limits"
  >
    <Heading style={styles.heading}>Webhooks</Heading>

    <Text style={styles.paragraph}>
      {userName}, rather than polling, subscribe. You can receive events for
      payments succeeding, failing or being refunded; payouts paid or failed;
      disputes created or resolved; agents created, updated or suspended; and
      credit limits changing.
    </Text>

    <Text style={styles.paragraph}>
      Endpoints must be https, so the signing secret is never sent in the clear.
      The secret is shown once when you create the endpoint and can be rotated
      later. Always verify the signature before trusting a payload.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.app}/settings/developer`}
      label="Add a webhook endpoint"
    />
  </Layout>
);

Webhooks.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-webhooks">;

export default Webhooks;
