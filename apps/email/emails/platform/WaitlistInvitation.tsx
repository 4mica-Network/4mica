import type { TemplateProps } from "@4mica/email-client";
import { brand, CallToAction, Layout, styles } from "@components/index";
import { Heading, Text } from "react-email";

export const WaitlistInvitation = ({
  userName,
  actionUrl,
  expiresInDays,
}: TemplateProps<"waitlist-invitation">) => (
  <Layout preview={`Your ${brand.name} invite is ready`}>
    <Heading style={styles.heading}>Your invite is ready</Heading>

    <Text style={styles.paragraph}>
      {userName}, your spot on {brand.name} just opened up. Claim it and you can
      register your first agent right away.
    </Text>

    <CallToAction href={actionUrl} label="Claim your invite" />

    <Text style={styles.muted}>
      This link expires in {expiresInDays}{" "}
      {expiresInDays === 1 ? "day" : "days"}. If it lapses, reply to this email
      and we'll send a fresh one.
    </Text>
  </Layout>
);

WaitlistInvitation.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  actionUrl: "https://app.4mica.io/sign-up?invite=preview",
  expiresInDays: 7,
} satisfies TemplateProps<"waitlist-invitation">;

export default WaitlistInvitation;
