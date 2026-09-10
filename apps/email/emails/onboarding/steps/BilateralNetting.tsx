import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const BilateralNetting = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-bilateral-netting">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="67 guarantees collapse into one net movement"
  >
    <Heading style={styles.heading}>Netting, concretely</Heading>

    <Text style={styles.paragraph}>
      {userName}, suppose you send 40 guarantees to a counterparty over a cycle
      and receive 27 back. Netting collapses those into a single net position of
      13 — one movement instead of 67.
    </Text>

    <Text style={styles.paragraph}>
      Do that across every pair of participants and a cycle's worth of traffic
      reduces to one net figure per participant. That is the whole reason
      micropayments stop being absurd: the on-chain cost is paid once per cycle,
      not once per call.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/core-concepts/bilateral-netting-cycles`}
      label="Read about netting cycles"
    />
  </Layout>
);

BilateralNetting.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-bilateral-netting">;

export default BilateralNetting;
