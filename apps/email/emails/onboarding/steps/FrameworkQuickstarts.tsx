import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const FrameworkQuickstarts = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-framework-quickstarts">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Node, Next, Express, Hono, Bun, Python, Rust"
  >
    <Heading style={styles.heading}>Whatever you are building in</Heading>

    <Text style={styles.paragraph}>
      {userName}, there are quick starts for Node, Next.js, Express, Hono and
      Bun; for Python with FastAPI and Flask; and for Rust.
    </Text>

    <Text style={styles.paragraph}>
      Adapters exist for several of these; a few are still in progress, and
      where one is not ready yet the runtime-neutral paywall covers you in the
      meantime.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/quick-start/nodejs`}
      label="Find your quick start"
    />
  </Layout>
);

FrameworkQuickstarts.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-framework-quickstarts">;

export default FrameworkQuickstarts;
