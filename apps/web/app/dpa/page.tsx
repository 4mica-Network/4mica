import LegalPage from "@components/legal/LegalPage";
import { readToc } from "@components/legal/readToc";
import { createPageMetadata } from "@seo/shared";
import Content from "./content.mdx";

export const metadata = createPageMetadata({
  title: "Data Processing Agreement | 4Mica",
  description:
    "The 4Mica Data Processing Agreement, governing how 4Mica processes personal data on behalf of its customers.",
  keywords: [
    "4Mica DPA",
    "data processing agreement",
    "GDPR",
    "data protection",
  ],
  url: "/dpa",
  imageAlt: "4Mica Data Processing Agreement",
});

export default function DpaPage() {
  const toc = readToc("app/dpa/content.mdx");

  return (
    <LegalPage
      title="Data Processing Agreement"
      lastUpdated="June 2026"
      toc={toc}
    >
      <Content />
    </LegalPage>
  );
}
