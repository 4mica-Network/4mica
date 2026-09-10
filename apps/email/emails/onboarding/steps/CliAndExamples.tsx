import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const CliAndExamples = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-cli-and-examples">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="npx @4mica/cli, plus two agents that pay each other"
  >
    <Heading style={styles.heading}>The CLI and the examples</Heading>

    <Text style={styles.paragraph}>
      {userName}, <code>npx @4mica/cli</code> scaffolds a buyer or seller
      project for your framework and runs it. Everything runs in demo mode
      against a mock verifier, so you need no credentials to see it work.
    </Text>

    <Text style={styles.paragraph}>
      There are also two example agents worth a look: one sells jokes and
      paywalls the punchline with per-category pricing, and one buys them on a
      budget, rates them, and adapts what it buys. Together they are a complete
      agent-to-agent payment loop you can run locally.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/getting-started/quickstart`}
      label="Read the docs"
    />
  </Layout>
);

CliAndExamples.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-cli-and-examples">;

export default CliAndExamples;
