import type { TemplateProps } from "@4mica/email-client";
import { brand, CallToAction, Layout, styles } from "@components/index";
import { Heading, Text } from "react-email";

export const AccountVerification = ({
  userName,
  verifyUrl,
  expiresInHours,
}: TemplateProps<"account-verification">) => (
  <Layout preview={`Verify your email for ${brand.name}`}>
    <Heading style={styles.heading}>Verify your email address</Heading>

    <Text style={styles.paragraph}>
      Hi {userName}, welcome to {brand.name}. Confirm this is your address and
      your account is verified — that's all we need.
    </Text>

    <CallToAction href={verifyUrl} label="Verify my email" />

    <Text style={styles.muted}>
      This link works once and expires in {expiresInHours}{" "}
      {expiresInHours === 1 ? "hour" : "hours"}. If it lapses, request a new one
      from your profile settings.
    </Text>

    <Text style={styles.muted}>
      If you did not create a {brand.name} account you can safely ignore this
      email — nothing changes until the link above is opened.
    </Text>
  </Layout>
);

AccountVerification.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  verifyUrl: "https://api.4mica.io/verify-email?token=preview",
  expiresInHours: 24,
} satisfies TemplateProps<"account-verification">;

export default AccountVerification;
