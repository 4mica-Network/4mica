import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const PaymentMiddleware = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-payment-middleware">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="A paywall that returns 402 or gets out of the way"
  >
    <Heading style={styles.heading}>Middleware, not plumbing</Heading>

    <Text style={styles.paragraph}>
      {userName}, the server paywall does one job: given a request, it either
      returns a 402 describing what payment it wants, or lets the request
      through with a payment response header attached.
    </Text>

    <Text style={styles.paragraph}>
      There is a runtime-neutral version that works anywhere, plus framework
      middleware where it helps. It is edge-safe, so it runs in workers and edge
      functions as well as on a server.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/seller/payment-middleware`}
      label="Read about middleware"
    />
  </Layout>
);

PaymentMiddleware.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-payment-middleware">;

export default PaymentMiddleware;
