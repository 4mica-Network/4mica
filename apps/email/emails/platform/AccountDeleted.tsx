import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  DetailList,
  formatDate,
  Layout,
  styles,
} from "@components/index";
import { Heading, Text } from "react-email";

export const AccountDeleted = ({
  userName,
  deletedAt,
  restoreWindowDays,
  feedbackUrl,
}: TemplateProps<"account-deleted">) => (
  <Layout preview={`Your ${brand.name} account has been deleted`}>
    <Heading style={styles.heading}>Your account has been deleted</Heading>

    <Text style={styles.paragraph}>
      {userName}, we've deleted your {brand.name} account and deactivated every
      agent and key attached to it.
    </Text>

    <DetailList rows={[{ label: "Deleted", value: formatDate(deletedAt) }]} />

    {restoreWindowDays ? (
      <Text style={styles.paragraph}>
        If this was a mistake, contact support within{" "}
        <strong>
          {restoreWindowDays} {restoreWindowDays === 1 ? "day" : "days"}
        </strong>{" "}
        and we can restore it. After that the data is gone permanently.
      </Text>
    ) : null}

    {feedbackUrl ? (
      <CallToAction href={feedbackUrl} label="Tell us why you left" />
    ) : null}
  </Layout>
);

AccountDeleted.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  deletedAt: "2026-08-10T08:00:00.000Z",
  restoreWindowDays: 30,
  feedbackUrl: "https://4mica.io/feedback",
} satisfies TemplateProps<"account-deleted">;

export default AccountDeleted;
