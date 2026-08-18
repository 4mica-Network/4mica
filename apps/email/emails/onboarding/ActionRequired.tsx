import type { TemplateProps } from "@4mica/email-client";
import { CallToAction, Layout, styles } from "@components/index";
import { Heading, Text } from "react-email";

export const ActionRequired = ({
  userName,
  actionText,
  actionUrl,
  reason,
}: TemplateProps<"action-required">) => (
  <Layout preview={`Action required: ${actionText}`}>
    <Heading style={styles.heading}>Action required</Heading>

    <Text style={styles.paragraph}>
      Hi {userName}, we need one thing from you before we can continue:{" "}
      <strong>{actionText}</strong>.
    </Text>

    {reason ? <Text style={styles.paragraph}>{reason}</Text> : null}

    <CallToAction href={actionUrl} label={actionText} />

    <Text style={styles.muted}>
      If you did not expect this email you can safely ignore it — nothing
      changes until you complete the step above.
    </Text>
  </Layout>
);

ActionRequired.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  actionText: "Verify your email address",
  actionUrl: "https://app.4mica.io/verify?token=preview",
  reason: "We send this once, to confirm we can reach you about your account.",
} satisfies TemplateProps<"action-required">;

export default ActionRequired;
