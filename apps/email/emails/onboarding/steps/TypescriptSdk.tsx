import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const TypescriptSdk = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-typescript-sdk">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="deposit, withdraw, payment, settlement, account, tokens"
  >
    <Heading style={styles.heading}>Working with the SDK</Heading>

    <Text style={styles.paragraph}>
      {userName}, the TypeScript SDK is organised by capability: deposit,
      withdraw, payment, settlement, account and tokens. You reach for the one
      you need rather than learning the whole surface.
    </Text>

    <Text style={styles.paragraph}>
      It is runtime-neutral — no Node built-ins in the core path — so the same
      package works on a server, in a worker and at the edge. It also supports
      gasless flows, where you sign an authorization and a facilitator submits
      the transaction and pays the gas.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/sdks/backend`}
      label="Read the SDK docs"
    />
  </Layout>
);

TypescriptSdk.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-typescript-sdk">;

export default TypescriptSdk;
