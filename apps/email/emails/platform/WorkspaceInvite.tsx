import type { TemplateProps } from "@4mica/email-client";
import { CallToAction, Layout, styles } from "@components/index";
import { Heading, Text } from "react-email";

export const WorkspaceInvite = ({
  userName,
  workspaceName,
  inviteUrl,
  invitedByName,
  expiresInDays,
}: TemplateProps<"workspace-invite">) => (
  <Layout preview={`Join ${workspaceName} on 4Mica`}>
    <Heading style={styles.heading}>Join {workspaceName}</Heading>

    <Text style={styles.paragraph}>
      Hi {userName}, {invitedByName ?? "a teammate"} invited you to the{" "}
      <strong>{workspaceName}</strong> workspace. Accepting gives you access to
      its agents, credit limits and settlement history.
    </Text>

    <CallToAction href={inviteUrl} label="Accept invitation" />

    {expiresInDays ? (
      <Text style={styles.muted}>
        This invitation expires in {expiresInDays}{" "}
        {expiresInDays === 1 ? "day" : "days"}.
      </Text>
    ) : null}
  </Layout>
);

WorkspaceInvite.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  workspaceName: "Northwind Labs",
  inviteUrl: "https://app.4mica.io/invites/preview",
  invitedByName: "Grace",
  expiresInDays: 14,
} satisfies TemplateProps<"workspace-invite">;

export default WorkspaceInvite;
