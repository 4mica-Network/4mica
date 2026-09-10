import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  palette,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Link, Text } from "react-email";

export const GoLiveAndSupport = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-go-live-and-support">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="The last checklist, and how to reach a human"
  >
    <Heading style={styles.heading}>Going live</Heading>

    <Text style={styles.paragraph}>
      {userName}, the go-live guides are the last thing to read: real
      collateral, real limits, monitoring, and what to check before you switch
      networks.
    </Text>

    <Text style={styles.paragraph}>
      On pricing: it starts at 0.5% of net settled volume, charged once per
      cycle when a cycle settles, and it steps down as your volume grows. Your
      rate is confirmed in writing before you go live — nothing is a surprise.
    </Text>

    <Text style={styles.paragraph}>
      When you need us: reply to any of these emails or write to{" "}
      <Link href={`mailto:${brand.support}`} style={{ color: palette.brand }}>
        {brand.support}
      </Link>
      . There is a live status page for uptime, a changelog for what has
      shipped, and our work is on GitHub if you would rather open an issue.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/seller/go-live`}
      label="Read the go-live checklist"
    />
  </Layout>
);

GoLiveAndSupport.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-go-live-and-support">;

export default GoLiveAndSupport;
