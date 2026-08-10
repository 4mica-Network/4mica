import type { TemplateProps } from "@4mica/email-client";
import { CallToAction, Layout, styles } from "@components/index";
import { Heading, Text } from "react-email";

export const Announcement = ({
  userName,
  title,
  body,
  ctaText,
  ctaUrl,
}: TemplateProps<"announcement">) => (
  <Layout preview={title}>
    <Heading style={styles.heading}>{title}</Heading>

    <Text style={styles.paragraph}>Hi {userName},</Text>

    {body.split("\n\n").map((paragraph) => (
      <Text key={paragraph.slice(0, 48)} style={styles.paragraph}>
        {paragraph}
      </Text>
    ))}

    {ctaUrl ? (
      <CallToAction href={ctaUrl} label={ctaText ?? "Read more"} />
    ) : null}
  </Layout>
);

Announcement.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  title: "Instant settlement is live on Base",
  body: "Agent payments on Base now settle in under two seconds, down from the previous ~15 second window.\n\nNothing changes in your integration — existing agents pick it up automatically on their next transaction.",
  ctaText: "Read the changelog",
  ctaUrl: "https://docs.4mica.io/changelog",
} satisfies TemplateProps<"announcement">;

export default Announcement;
