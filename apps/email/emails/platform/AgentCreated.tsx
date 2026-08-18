import type { TemplateProps } from "@4mica/email-client";
import { CallToAction, DetailList, Layout, styles } from "@components/index";
import { Heading, Text } from "react-email";

export const AgentCreated = ({
  userName,
  agentName,
  agentId,
  agentUrl,
}: TemplateProps<"agent-created">) => (
  <Layout preview={`${agentName} is registered and ready`}>
    <Heading style={styles.heading}>{agentName} is registered</Heading>

    <Text style={styles.paragraph}>
      {userName}, your agent is live. Give it a credit limit and it can start
      transacting immediately.
    </Text>

    <DetailList
      rows={[
        { label: "Agent", value: agentName },
        { label: "ID", value: agentId },
      ]}
    />

    {agentUrl ? (
      <CallToAction href={agentUrl} label="Configure this agent" />
    ) : null}

    <Text style={styles.muted}>
      If you did not create this agent, revoke its key from the dashboard right
      away.
    </Text>
  </Layout>
);

AgentCreated.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  agentName: "research-scout",
  agentId: "agt_4m_01J8ZK",
  agentUrl: "https://app.4mica.io/agents/preview",
} satisfies TemplateProps<"agent-created">;

export default AgentCreated;
