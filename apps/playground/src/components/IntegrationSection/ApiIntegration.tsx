import { EmptyState, Tag, Link as UiLink } from "@4mica/ui";
import { ExternalLink } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { CodeTabs } from "@/components/CodeTabs";
import { messages } from "@/i18n";
import { buildApiListingSnippets } from "@/lib/snippets/api-listing";
import { networkInfo } from "@/lib/snippets/networks";
import { links } from "@/services/links";
import type { PublicApiListing } from "@/types";
import { Step, StepList } from "./Step";

export interface ApiIntegrationProps {
  listing: PublicApiListing;
  isOwner: boolean;
}

/**
 * Buyer-side integration for one API listing: install, pay for a call, then find
 * the payment afterwards. Every value in the snippets comes from the row.
 */
export function ApiIntegration({ listing, isOwner }: ApiIntegrationProps) {
  const snippets = buildApiListingSnippets(listing);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-ink-strong text-lg">
          {messages.integration.heading}
        </h2>
        <p className="text-ink-muted text-sm">
          {snippets
            ? messages.integration.apiLead
            : isOwner
              ? messages.integration.notPayableOwner
              : messages.integration.notPayable}
        </p>
      </div>

      {listing.network && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag size="sm" variant="neutral">
              {networkInfo(listing.network).label}
            </Tag>
            <Tag size="sm" variant="neutral">
              {listing.assetAddress === null
                ? messages.integration.nativeAsset
                : messages.integration.erc20}
            </Tag>
          </div>
          {/* Which token, not just that it is one — a buyer cannot approve an
              allowance without the address. */}
          {listing.assetAddress && (
            <p className="break-all font-mono text-ink-subtle text-xs">
              {listing.assetAddress}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-ink-subtle text-xs uppercase tracking-wide">
          {messages.integration.endpointsTitle}
        </h3>
        <ul className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10">
          {listing.endpoints.length > 0 ? (
            listing.endpoints.map((endpoint) => (
              <li
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
                key={endpoint.id}
              >
                <code className="font-mono text-ink-strong text-sm">
                  <span className="text-ink-subtle">{endpoint.method}</span>{" "}
                  {endpoint.path}
                </code>
                {endpoint.summary && (
                  <span className="text-ink-muted text-sm">
                    {endpoint.summary}
                  </span>
                )}
              </li>
            ))
          ) : (
            <li>
              <EmptyState
                variant="plain"
                size="sm"
                title={messages.integration.noEndpoints}
              />
            </li>
          )}
        </ul>
      </div>

      {snippets && (
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
          </Step>

          <Step
            index={3}
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
      )}

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
