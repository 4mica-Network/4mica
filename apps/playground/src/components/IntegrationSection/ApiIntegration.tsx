import { CodeBlock } from "@/components/CodeBlock";
import { CodeTabs } from "@/components/CodeTabs";
import { Disclosure, DisclosureList } from "@/components/Disclosure";
import { RevealLink } from "@/components/RevealLink";
import { messages } from "@/i18n";
import { buildApiListingSnippets } from "@/lib/snippets/api-listing";
import { links } from "@/services/links";
import type { PublicApiListing } from "@/types";

export interface ApiIntegrationProps {
  listing: PublicApiListing;
  isOwner: boolean;
}

export function ApiIntegration({ listing, isOwner }: ApiIntegrationProps) {
  const snippets = buildApiListingSnippets(listing);

  if (!snippets) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-ink-strong text-lg tracking-tight">
          {messages.integration.heading}
        </h2>
        <p className="text-ink-muted text-sm">
          {isOwner
            ? messages.integration.notPayableOwner
            : messages.integration.notPayable}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-ink-strong text-lg tracking-tight">
          {messages.integration.heading}
        </h2>
        <p className="text-ink-muted text-sm">{messages.integration.apiLead}</p>
      </div>

      <DisclosureList>
        <Disclosure
          index={1}
          lead={messages.integration.installLead}
          title={messages.integration.installTitle}
        >
          <CodeBlock code={snippets.install} label="Terminal" lang="bash" />
        </Disclosure>

        <Disclosure
          index={2}
          lead={messages.integration.callLead}
          title={messages.integration.callTitle}
        >
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
        </Disclosure>

        <Disclosure
          index={3}
          lead={messages.integration.receiptLead}
          title={messages.integration.receiptTitle}
        >
          <CodeBlock
            code={snippets.receipt}
            lang="typescript"
            showLineNumbers
          />
        </Disclosure>
      </DisclosureList>

      <RevealLink className="self-start" external href={links.docs}>
        {messages.integration.viewDocs}
      </RevealLink>
    </section>
  );
}
