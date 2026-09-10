import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const TestInSandbox = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-test-in-sandbox">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Testnets are free and unmetered"
  >
    <Heading style={styles.heading}>Test in the sandbox</Heading>

    <Text style={styles.paragraph}>
      {userName}, testnets are free and unmetered — there are no fees on them,
      so you can hammer your integration as hard as you like while you are
      working things out.
    </Text>

    <Text style={styles.paragraph}>
      Run the full flow there first: deposit, spend, close a cycle, settle. The
      failure modes you want to meet in a sandbox are the ones around cycle
      boundaries and withdrawal timing, and you will not see those in a
      five-minute test.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/buyer/test-in-sandbox`}
      label="Read the sandbox guide"
    />
  </Layout>
);

TestInSandbox.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-test-in-sandbox">;

export default TestInSandbox;
