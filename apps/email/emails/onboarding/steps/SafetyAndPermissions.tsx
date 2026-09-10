import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const SafetyAndPermissions = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-safety-and-permissions">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Scoping authority before you hand it over"
  >
    <Heading style={styles.heading}>Safety and permissions</Heading>

    <Text style={styles.paragraph}>
      {userName}, paying on your behalf is an authority you are delegating, so
      it is worth scoping deliberately: which sellers, which categories, which
      networks, and up to what value without a human in the loop.
    </Text>

    <Text style={styles.paragraph}>
      The safety guide covers how to reason about that, and how to keep an
      agent's blast radius small enough that a bad decision is an annoyance
      rather than an incident.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/buyer/safety-and-permissions`}
      label="Read about permissions"
    />
  </Layout>
);

SafetyAndPermissions.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-safety-and-permissions">;

export default SafetyAndPermissions;
