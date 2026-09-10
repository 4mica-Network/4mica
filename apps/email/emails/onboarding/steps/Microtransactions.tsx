import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const Microtransactions = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-microtransactions">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="When the fee stops dwarfing the payment"
  >
    <Heading style={styles.heading}>
      Micropayments that survive contact with reality
    </Heading>

    <Text style={styles.paragraph}>
      {userName}, the reason micropayments have never worked is arithmetic: if
      clearing a payment costs more than the payment, the model collapses.
    </Text>

    <Text style={styles.paragraph}>
      Netting fixes that by paying the on-chain cost once per cycle rather than
      once per call. A million calls settle as one movement, so the per-call
      overhead approaches nothing.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/seller/microtransactions`}
      label="Read about microtransactions"
    />
  </Layout>
);

Microtransactions.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-microtransactions">;

export default Microtransactions;
