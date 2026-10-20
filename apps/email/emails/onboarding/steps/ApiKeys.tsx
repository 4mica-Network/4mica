import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const ApiKeys = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-api-keys">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Shown once, stored hashed, revocable without losing the trail"
  >
    <Heading style={styles.heading}>Your API key, {userName}</Heading>

    <Text style={styles.paragraph}>
      This is the first thing you will touch and the easiest one to get wrong,
      so let me be precise about it. API keys authenticate server-to-server
      requests. Create one under Settings → Developer, give it a name you will
      recognise later, and copy it immediately — the plaintext is shown exactly
      once and stored only as a hash, so we cannot show it to you again.
    </Text>

    <Text style={styles.paragraph}>
      Keys can be renamed, revoked or deleted. Prefer revoking: it stops the key
      working while keeping the audit trail intact, which is what you want when
      you are working out whether a key leaked.
    </Text>

    <Text style={styles.paragraph}>
      One rule I will not soften: a key belongs on your server, in an
      environment variable, never in client-side code.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.app}/settings/developer`}
      label="Create an API key"
    />
  </Layout>
);

ApiKeys.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-api-keys">;

export default ApiKeys;
