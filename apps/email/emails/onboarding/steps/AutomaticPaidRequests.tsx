import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const AutomaticPaidRequests = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-automatic-paid-requests">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Wrap fetch once, stop thinking about 402s"
  >
    <Heading style={styles.heading}>Paying without thinking about it</Heading>

    <Text style={styles.paragraph}>
      {userName}, rather than handling 402 responses by hand everywhere, you
      wrap your fetch once. The wrapper catches the 402, produces the payment,
      retries the request, and returns the response your code was expecting.
    </Text>

    <Text style={styles.paragraph}>
      Your application logic stops containing payment logic, which is the point.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/buyer/make-paid-requests-automatically`}
      label="Read the guide"
    />
  </Layout>
);

AutomaticPaidRequests.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-automatic-paid-requests">;

export default AutomaticPaidRequests;
