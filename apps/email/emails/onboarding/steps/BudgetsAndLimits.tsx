import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const BudgetsAndLimits = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-budgets-and-limits">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="Per-request, per-task, per-seller, per-window caps"
  >
    <Heading style={styles.heading}>Budgets and spending limits</Heading>

    <Text style={styles.paragraph}>
      {userName}, an agent with a payment method and no limits is a bad idea.{" "}
      {brand.name} supports caps per request, per task, per time window, per
      seller, per category, and per network or asset.
    </Text>

    <Text style={styles.paragraph}>
      You can also require an approval gate above a threshold, and stop an agent
      mid-task. Two things worth reading carefully: costs that are hidden
      downstream of the call you approved, and the fact that refunds are your
      policy to define, not something the protocol decides for you.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/buyer/budgets-and-spending-limits`}
      label="Read about budgets"
    />
  </Layout>
);

BudgetsAndLimits.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-budgets-and-limits">;

export default BudgetsAndLimits;
