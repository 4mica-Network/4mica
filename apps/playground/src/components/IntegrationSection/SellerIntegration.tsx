import { CodeBlock } from "@/components/CodeBlock";
import { RevealLink } from "@/components/RevealLink";
import type { FlowStep } from "@/components/StepFlow";
import { messages, t } from "@/i18n";
import type { SetupGap } from "@/lib/payable";
import type { SellerSnippets } from "@/lib/snippets/seller";
import { links } from "@/services/links";
import { StepLead } from "./StepLead";

export interface SellerSetup {
  kind: "listing" | "agent";
  dashboardUrl: string;
  gaps: SetupGap[];
}

export function buildSellerSteps(
  snippets: SellerSnippets | null,
  { kind, dashboardUrl, gaps }: SellerSetup,
): FlowStep[] {
  if (!snippets || gaps.length > 0) {
    return [
      {
        id: "seller-setup",
        title: messages.integration.sellerIncompleteTitle,
        content: (
          <>
            <StepLead>
              {t(messages.integration.sellerIncompleteLead, {
                kind: messages.integration.sellerIncompleteKind[kind],
              })}
            </StepLead>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ink-body text-sm leading-relaxed">
              {gaps.map((gap) => (
                <li key={gap}>{messages.integration.sellerGap[gap]}</li>
              ))}
            </ul>
            <RevealLink external href={dashboardUrl}>
              {messages.integration.sellerOpenDashboard}
            </RevealLink>
          </>
        ),
      },
    ];
  }

  return [
    {
      id: "seller-install",
      title: messages.integration.sellerInstallTitle,
      content: (
        <>
          <StepLead>{messages.integration.sellerInstallLead}</StepLead>
          <CodeBlock code={snippets.install} label="Terminal" lang="bash" />
        </>
      ),
    },
    {
      id: "seller-key",
      title: messages.integration.sellerKeyTitle,
      content: (
        <>
          <StepLead>{messages.integration.sellerKeyLead}</StepLead>
          <CodeBlock code={snippets.env} label=".env" lang="bash" />
          <RevealLink external href={dashboardUrl}>
            {messages.integration.sellerOpenDashboard}
          </RevealLink>
        </>
      ),
    },
    {
      id: "seller-connect",
      title: messages.integration.sellerConnectTitle,
      content: (
        <>
          <StepLead>{messages.integration.sellerConnectLead}</StepLead>
          <CodeBlock
            code={snippets.connect}
            label="server.ts"
            lang="typescript"
            showLineNumbers
          />
        </>
      ),
    },
    {
      id: "seller-record",
      title: messages.integration.sellerRecordTitle,
      content: (
        <>
          <StepLead>{messages.integration.sellerRecordLead}</StepLead>
          <CodeBlock
            code={snippets.record}
            label="server.ts"
            lang="typescript"
            showLineNumbers
          />
        </>
      ),
    },
    {
      id: "seller-protect",
      title: messages.integration.sellerProtectTitle,
      content: (
        <>
          <StepLead>{messages.integration.sellerProtectLead}</StepLead>
          <CodeBlock
            code={snippets.protect}
            label="server.ts"
            lang="typescript"
            showLineNumbers
          />
        </>
      ),
    },
    {
      id: "seller-handle",
      title: messages.integration.sellerHandleTitle,
      content: (
        <>
          <StepLead>{messages.integration.sellerHandleLead}</StepLead>
          <CodeBlock
            code={snippets.handle}
            label="server.ts"
            lang="typescript"
            showLineNumbers
          />
        </>
      ),
    },
    {
      id: "seller-test",
      title: messages.integration.sellerTestTitle,
      content: (
        <>
          <StepLead>{messages.integration.sellerTestLead}</StepLead>
          <CodeBlock code={snippets.test} label="Terminal" lang="bash" />
          <RevealLink external href={`${links.docs}/seller/payment-middleware`}>
            {messages.integration.viewDocs}
          </RevealLink>
        </>
      ),
    },
  ];
}
