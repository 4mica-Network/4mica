import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const Facilitator = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-facilitator">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="/supported, /verify, /settle"
  >
    <Heading style={styles.heading}>Facilitators</Heading>

    <Text style={styles.paragraph}>
      {userName}, a facilitator sits between buyer and seller: it advertises
      which schemes it supports, verifies payments, and settles them. Ours is
      hosted and ready to point at.
    </Text>

    <Text style={styles.paragraph}>
      Its API is small on purpose — <code>/supported</code>,{" "}
      <code>/verify</code>, <code>/settle</code> and <code>/health</code>. If
      you already run a facilitator, adding {brand.name} means advertising the
      credit scheme and calling Core during settlement, not replacing anything.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/core-concepts/facilitator`}
      label="Read the facilitator docs"
    />
  </Layout>
);

Facilitator.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-facilitator">;

export default Facilitator;
