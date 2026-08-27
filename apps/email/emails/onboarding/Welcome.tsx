import type { TemplateProps } from "@4mica/email-client";
import { brand, CallToAction, Layout, styles } from "@components/index";
import { Heading, Text } from "react-email";

export const Welcome = ({ userName, ctaUrl }: TemplateProps<"welcome">) => (
  <Layout preview={`Welcome to ${brand.name}`}>
    <Heading style={styles.heading}>
      Welcome to {brand.name}, {userName}
    </Heading>

    <Text style={styles.paragraph}>
      Your account is ready. {brand.name} is the credit layer for the agentic
      economy — register an agent, set its spending limits, and let it transact
      without you wiring up a payment stack.
    </Text>

    <Text style={styles.paragraph}>
      The fastest way in is to register your first agent and issue it a key.
    </Text>

    <CallToAction href={ctaUrl ?? brand.app} label="Open your dashboard" />

    <Text style={styles.muted}>
      New here? The docs walk through the first integration end to end.
    </Text>
  </Layout>
);

Welcome.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
} satisfies TemplateProps<"welcome">;

export default Welcome;
