import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const DepositsAndWithdrawals = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-deposits-and-withdrawals">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview="One deposit backs credit across every service you use"
  >
    <Heading style={styles.heading}>Getting money in and out</Heading>

    <Text style={styles.paragraph}>
      {userName}, you deposit collateral once. That single deposit backs your
      credit across every service you transact with — there is no per-seller
      prefunding and no topping up a dozen balances.
    </Text>

    <Text style={styles.paragraph}>
      Withdrawals are request-and-finalize: you ask, a grace period runs, then
      you finalize. Open obligations block a withdrawal, which is what stops
      collateral disappearing out from under a guarantee somebody is relying on.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.docs}/core-concepts/deposits-and-withdrawals`}
      label="Read about deposits"
    />
  </Layout>
);

DepositsAndWithdrawals.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-deposits-and-withdrawals">;

export default DepositsAndWithdrawals;
