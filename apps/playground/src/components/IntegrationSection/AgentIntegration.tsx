import { Tag, Link as UiLink } from "@4mica/ui";
import { ExternalLink } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { CodeTabs } from "@/components/CodeTabs";
import { Disclosure, DisclosureList } from "@/components/Disclosure";
import { messages } from "@/i18n";
import {
  buildAgentBuyerSnippets,
  buildAgentSnippets,
} from "@/lib/snippets/agent";
import { links } from "@/services/links";
import type { PublicAgent } from "@/types";

export interface AgentIntegrationProps {
  agent: PublicAgent;
  isOwner: boolean;
}

export function AgentIntegration({ agent, isOwner }: AgentIntegrationProps) {
  const buyer = buildAgentBuyerSnippets(agent);
  const runner = buildAgentSnippets(agent);

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-ink-strong text-lg tracking-tight">
              {messages.integration.agentBuyerHeading}
            </h2>
            {agent.status !== "ACTIVE" && (
              <Tag size="sm" variant="warning">
                {messages.integration.inactiveAgent}
              </Tag>
            )}
          </div>
          <p className="text-ink-muted text-sm">
            {buyer
              ? messages.integration.agentBuyerLead
              : isOwner
                ? messages.integration.agentNotSellableOwner
                : messages.integration.agentNotSellable}
          </p>
        </div>

        {buyer && (
          <DisclosureList>
            <Disclosure
              index={1}
              lead={messages.integration.installLead}
              title={messages.integration.installTitle}
            >
              <CodeBlock code={buyer.install} label="Terminal" lang="bash" />
            </Disclosure>

            <Disclosure
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
            </Disclosure>

            <Disclosure
              index={3}
              lead={messages.integration.receiptLead}
              title={messages.integration.receiptTitle}
            >
              <CodeBlock
                code={buyer.receipt}
                lang="typescript"
                showLineNumbers
              />
            </Disclosure>
          </DisclosureList>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-ink-strong text-lg tracking-tight">
            {messages.integration.agentRunHeading}
          </h2>
          <p className="text-ink-muted text-sm">
            {messages.integration.agentLead}
          </p>
        </div>

        <DisclosureList>
          <Disclosure
            index={1}
            lead={messages.integration.installLead}
            title={messages.integration.installTitle}
          >
            <CodeBlock code={runner.install} label="Terminal" lang="bash" />
          </Disclosure>

          <Disclosure
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
              <p className="pt-2 text-ink-subtle text-xs">
                {messages.integration.walletOwnerOnly}
              </p>
            )}
          </Disclosure>

          <Disclosure
            index={3}
            lead={messages.integration.collateralLead}
            title={messages.integration.collateralTitle}
          >
            <CodeBlock
              code={runner.collateral}
              lang="typescript"
              showLineNumbers
            />
          </Disclosure>

          <Disclosure
            index={4}
            lead={messages.integration.receiptLead}
            title={messages.integration.receiptTitle}
          >
            <CodeBlock
              code={runner.receipt}
              lang="typescript"
              showLineNumbers
            />
          </Disclosure>
        </DisclosureList>
      </div>

      <UiLink
        className="self-start text-sm"
        external
        href={links.docs}
        icon={<ExternalLink aria-hidden="true" className="h-4 w-4" />}
      >
        {messages.integration.viewDocs}
      </UiLink>
    </section>
  );
}
