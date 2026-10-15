import { links } from "@4mica/url";
import Footer from "@components/Footer";
import Header from "@components/Header";
import JsonLd from "@components/JsonLd";
import { metaFor } from "@seo/pages";
import { pageSchema } from "@seo/structuredData";
import { messages } from "@/i18n";
import DocsCalloutSection from "./DocsCalloutSection";

export const metadata = metaFor(links.developers);

const content = messages.developers;

export default function DevelopersPage() {
  return (
    <div className="min-h-screen">
      <JsonLd
        data={pageSchema([{ name: content.kicker, path: links.developers }])}
      />
      <Header />
      <div className="pt-36 pb-20">
        <section className="mx-auto max-w-3xl text-center">
          <p className="section-kicker">{content.kicker}</p>
          <h1 className="section-title text-balance font-normal">
            {content.title}
          </h1>
          <p className="section-lead mx-auto max-w-2xl">{content.lead}</p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={links.docs}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-ink-strong px-5 py-2.5 font-semibold text-md text-surface-deep transition-colors hover:bg-ink-strong/90"
            >
              {content.primaryCta}
              <i className="ri-arrow-right-line text-md" />
            </a>
            <a
              href={links.social.githubCore}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-overlay/15 bg-overlay/5 px-5 py-2.5 font-semibold text-ink-strong text-md transition-colors hover:bg-overlay/10"
            >
              <i className="ri-github-fill" />
              {content.secondaryCta}
            </a>
          </div>
        </section>

        <DocsCalloutSection />
      </div>
      <Footer />
    </div>
  );
}
