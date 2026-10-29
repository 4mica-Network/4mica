import { Tag } from "@4mica/ui";
import { CodeBlock } from "@/components/CodeBlock";
import { CodeTabs } from "@/components/CodeTabs";
import type { FlowStep } from "@/components/StepFlow";
import { messages } from "@/i18n";
import {
  buildAgentBuyerSnippets,
  buildAgentSnippets,
} from "@/lib/snippets/agent";
import type { PublicAgent } from "@/types";
import { StepLead } from "./StepLead";

export function buildAgentBuyerSteps(
  agent: PublicAgent,
  isOwner: boolean,
): FlowStep[] {
  const buyer = buildAgentBuyerSnippets(agent);
  const inactive = agent.status !== "ACTIVE" && (
    <Tag className="self-start" size="sm" variant="warning">
      {messages.integration.inactiveAgent}
    </Tag>
  );

  if (!buyer) {
    return [
      {
        id: "call",
        title: messages.integration.agentCallTitle,
        content: (
          <>
            {inactive}
            <StepLead>
              {isOwner
                ? messages.integration.agentNotSellableOwner
                : messages.integration.agentNotSellable}
            </StepLead>
          </>
        ),
      },
    ];
  }

  return [
    {
      id: "install",
      title: messages.integration.installTitle,
      content: (
        <>
          {inactive}
          <StepLead>{messages.integration.agentBuyerLead}</StepLead>
          <StepLead>{messages.integration.installLead}</StepLead>
          <CodeBlock code={buyer.install} label="Terminal" lang="bash" />
        </>
      ),
    },
    {
      id: "call",
      title: messages.integration.agentCallTitle,
      content: (
        <>
          {inactive}
          <StepLead>{messages.integration.agentCallLead}</StepLead>
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
        </>
      ),
    },
    {
      id: "receipt",
      title: messages.integration.receiptTitle,
      content: (
        <>
          <StepLead>{messages.integration.receiptLead}</StepLead>
          <CodeBlock code={buyer.receipt} lang="typescript" showLineNumbers />
        </>
      ),
    },
  ];
}

export function buildAgentRunSteps(
  agent: PublicAgent,
  isOwner: boolean,
): FlowStep[] {
  const runner = buildAgentSnippets(agent);

  return [
    {
      id: "run-install",
      title: messages.integration.installTitle,
      content: (
        <>
          <StepLead>{messages.integration.agentLead}</StepLead>
          <StepLead>{messages.integration.installLead}</StepLead>
          <CodeBlock code={runner.install} label="Terminal" lang="bash" />
        </>
      ),
    },
    {
      id: "run-pay",
      title: messages.integration.payTitle,
      content: (
        <>
          <StepLead>{messages.integration.payLead}</StepLead>
          <CodeBlock
            code={runner.typescript}
            lang="typescript"
            showLineNumbers
          />
          {isOwner && (
            <p className="text-ink-muted text-xs">
              {messages.integration.walletOwnerOnly}
            </p>
          )}
        </>
      ),
    },
    {
      id: "run-collateral",
      title: messages.integration.collateralTitle,
      content: (
        <>
          <StepLead>{messages.integration.collateralLead}</StepLead>
          <CodeBlock
            code={runner.collateral}
            lang="typescript"
            showLineNumbers
          />
        </>
      ),
    },
    {
      id: "run-receipt",
      title: messages.integration.receiptTitle,
      content: (
        <>
          <StepLead>{messages.integration.receiptLead}</StepLead>
          <CodeBlock code={runner.receipt} lang="typescript" showLineNumbers />
        </>
      ),
    },
  ];
}
