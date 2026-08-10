import type { TemplateProps } from "@4mica/email-client";
import { brand, Layout, styles } from "@components/index";
import { Heading, Text } from "react-email";

export const WaitlistConfirmation = ({
  userName,
  position,
}: TemplateProps<"waitlist-confirmation">) => (
  <Layout preview={`You're on the ${brand.name} waitlist`}>
    <Heading style={styles.heading}>You're on the list</Heading>

    <Text style={styles.paragraph}>
      Thanks for signing up, {userName}. We're opening {brand.name} in batches
      so every new team gets a proper onboarding, and you'll hear from us the
      moment your invite is ready.
    </Text>

    {position ? (
      <Text style={styles.paragraph}>
        You're currently <strong>#{position}</strong> in the queue.
      </Text>
    ) : null}

    <Text style={styles.muted}>
      Nothing to do for now — we'll email this address with your invite link.
    </Text>
  </Layout>
);

WaitlistConfirmation.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  position: 218,
} satisfies TemplateProps<"waitlist-confirmation">;

export default WaitlistConfirmation;
