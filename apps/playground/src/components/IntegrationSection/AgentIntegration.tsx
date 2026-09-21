import { Tag, Link as UiLink } from "@4mica/ui";
import { ExternalLink } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { CodeTabs } from "@/components/CodeTabs";
import { messages } from "@/i18n";
import {
  buildAgentBuyerSnippets,
  buildAgentSnippets,
} from "@/lib/snippets/agent";
import { networkInfo } from "@/lib/snippets/networks";
import { links } from "@/services/links";
import type { PublicAgent } from "@/types";
import { Step, StepList } from "./Step";

export interface AgentIntegrationProps {
  agent: PublicAgent;
  isOwner: boolean;
}

export function AgentIntegration({ agent, isOwner }: AgentIntegrationProps) {
  const buyer = buildAgentBuyerSnippets(agent);
  const runner = buildAgentSnippets(agent);
  const network = networkInfo(agent.network);

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-ink-strong text-lg">
            {messages.integration.agentBuyerHeading}
          </h2>
          <p className="text-ink-muted text-sm">
            {buyer
              ? messages.integration.agentBuyerLead
              : isOwner
                ? messages.integration.agentNotSellableOwner
                : messages.integration.agentNotSellable}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag size="sm" variant="neutral">
              {network.label}
            </Tag>
            {buyer && (
              <Tag size="sm" variant="neutral">
                {agent.assetAddress === null
                  ? messages.integration.nativeAsset
                  : messages.integration.erc20}
              </Tag>
            )}
            {agent.status !== "ACTIVE" && (
              <Tag size="sm" variant="warning">
                {messages.integration.inactiveAgent}
              </Tag>
            )}
          </div>
          {/* Which token, not just that it is one — a buyer cannot approve an
              allowance without the address. */}
          {agent.assetAddress && (
            <p className="break-all font-mono text-ink-subtle text-xs">
              {agent.assetAddress}
            </p>
          )}
        </div>

        {buyer && (
          <StepList>
            <Step
              index={1}
              lead={messages.integration.installLead}
              title={messages.integration.installTitle}
            >
              <CodeBlock code={buyer.install} lang="bash" label="Terminal" />
            </Step>

            <Step
              index={2}
              lead={messages.integration.agentCallLead}
              title={messages.integration.agentCallTitle}
            >
              <CodeTabs
                tabs={[
                  {
                    id: "typescript",
                    label: "TypeScript",
                    content: (
                      <CodeBlock
                        code={buyer.typescript}
                        lang="typescript"
                        showLineNumbers
                      />
                    ),
                  },
                  {
                    id: "python",
                    label: "Python",
                    content: (
                      <CodeBlock
                        code={buyer.python}
                        lang="python"
                        showLineNumbers
                      />
                    ),
                  },
                  {
                    id: "curl",
                    label: "cURL",
                    content: (
                      <CodeBlock
                        code={buyer.curl}
                        label="Wire format"
                        lang="bash"
                      />
                    ),
                  },
                ]}
              />
            </Step>

            <Step
              index={3}
              lead={messages.integration.receiptLead}
              title={messages.integration.receiptTitle}
            >
              <CodeBlock
                code={buyer.receipt}
                lang="typescript"
                showLineNumbers
              />
            </Step>
          </StepList>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-ink-strong text-lg">
            {messages.integration.agentRunHeading}
          </h2>
          <p className="text-ink-muted text-sm">
            {messages.integration.agentLead}
          </p>
        </div>

        <StepList>
          <Step
            index={1}
            lead={messages.integration.installLead}
            title={messages.integration.installTitle}
          >
            <CodeBlock code={runner.install} lang="bash" label="Terminal" />
          </Step>

          <Step
            index={2}
            lead={messages.integration.payLead}
            title={messages.integration.payTitle}
          >
            <CodeBlock
              code={runner.typescript}
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
              code={runner.collateral}
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
              code={runner.receipt}
              lang="typescript"
              showLineNumbers
            />
          </Step>
        </StepList>
      </div>

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
