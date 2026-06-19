import LegalPage from "@components/legal/LegalPage";
import { readToc } from "@components/legal/readToc";
import { createPageMetadata } from "@seo/shared";
import Content from "./content.mdx";

export const metadata = createPageMetadata({
  title: "Restricted and Prohibited Businesses | 4Mica",
  description:
    "Businesses and activities that may not use 4Mica, and those that require prior review before integrating with our credit-backed payment rails.",
  keywords: [
    "4Mica restricted businesses",
    "prohibited businesses",
    "acceptable use",
    "payments compliance",
  ],
  url: "/legal/restricted-businesses",
  imageAlt: "4Mica restricted and prohibited businesses",
});

export default function RestrictedBusinessesPage() {
  const toc = readToc("app/legal/restricted-businesses/content.mdx");

  return (
    <LegalPage
      title="Restricted and prohibited businesses"
      lastUpdated="June 2026"
      toc={toc}
    >
      <Content />
    </LegalPage>
  );
}
