import { CodeBlock } from "@/components/CodeBlock";
import { CodeTabs } from "@/components/CodeTabs";
import type { FlowStep } from "@/components/StepFlow";
import { messages } from "@/i18n";
import { buildApiListingSnippets } from "@/lib/snippets/api-listing";
import type { PublicApiListing } from "@/types";
import { StepLead } from "./StepLead";

export function buildApiIntegrationSteps(
  listing: PublicApiListing,
  isOwner: boolean,
): FlowStep[] {
  const snippets = buildApiListingSnippets(listing);

  if (!snippets) {
    return [
      {
        id: "integration",
        title: messages.integration.heading,
        content: (
          <StepLead>
            {isOwner
              ? messages.integration.notPayableOwner
              : messages.integration.notPayable}
          </StepLead>
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
          <StepLead>{messages.integration.installLead}</StepLead>
          <CodeBlock code={snippets.install} label="Terminal" lang="bash" />
        </>
      ),
    },
    {
      id: "call",
      title: messages.integration.callTitle,
      content: (
        <>
          <StepLead>{messages.integration.callLead}</StepLead>
          <CodeTabs
            tabs={[
              {
                id: "typescript",
                label: "TypeScript",
                content: (
                  <CodeBlock
                    code={snippets.typescript}
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
                    code={snippets.python}
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
                    code={snippets.curl}
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
          <CodeBlock
            code={snippets.receipt}
            lang="typescript"
            showLineNumbers
          />
        </>
      ),
    },
  ];
}
