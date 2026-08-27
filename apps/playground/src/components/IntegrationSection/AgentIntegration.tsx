import { Tag, Link as UiLink } from "@4mica/ui";
import { ExternalLink } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { messages } from "@/i18n";
import { buildAgentSnippets } from "@/lib/snippets/agent";
import { networkInfo } from "@/lib/snippets/networks";
import { links } from "@/services/links";
import type { PublicAgent } from "@/types";
import { Step, StepList } from "./Step";

export interface AgentIntegrationProps {
  agent: PublicAgent;
}

/**
 * Payer-side setup for one agent. An `Agent` is the paying identity in 4Mica —
 * it holds a wallet and a credit limit — so this shows how to make it pay, not
 * how to call it.
 *
 * The agent's wallet address reaches the snippet only when `agent.walletAddress`
 * is populated, which the service does for the owner alone.
 */
export function AgentIntegration({ agent }: AgentIntegrationProps) {
  const snippets = buildAgentSnippets(agent);
  const isOwner = agent.walletAddress !== null;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-ink-strong text-lg">
          {messages.integration.heading}
        </h2>
        <p className="text-ink-muted text-sm">
          {messages.integration.agentLead}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Tag size="sm" variant="neutral">
          {networkInfo(agent.network).label}
        </Tag>
        {agent.status !== "ACTIVE" && (
          <Tag size="sm" variant="warning">
            {messages.integration.inactiveAgent}
          </Tag>
        )}
      </div>

      <StepList>
        <Step
          index={1}
          lead={messages.integration.installLead}
          title={messages.integration.installTitle}
        >
          <CodeBlock code={snippets.install} lang="bash" label="Terminal" />
        </Step>

        <Step
          index={2}
          lead={messages.integration.payLead}
          title={messages.integration.payTitle}
        >
          <CodeBlock
            code={snippets.typescript}
            lang="typescript"
            showLineNumbers
          />
          {isOwner && (
            <p className="text-ink-subtle text-xs">
              {messages.integration.walletOwnerOnly}
            </p>
          )}
        </Step>

        <Step
          index={3}
          lead={messages.integration.collateralLead}
          title={messages.integration.collateralTitle}
        >
          <CodeBlock
            code={snippets.collateral}
            lang="typescript"
            showLineNumbers
          />
        </Step>

        <Step
          index={4}
          lead={messages.integration.receiptLead}
          title={messages.integration.receiptTitle}
        >
          <CodeBlock
            code={snippets.receipt}
            lang="typescript"
            showLineNumbers
          />
        </Step>
      </StepList>

      <UiLink
        className="text-sm"
        external
        href={links.docs}
        icon={<ExternalLink aria-hidden="true" className="h-4 w-4" />}
      >
        {messages.integration.viewDocs}
      </UiLink>
    </section>
  );
}
