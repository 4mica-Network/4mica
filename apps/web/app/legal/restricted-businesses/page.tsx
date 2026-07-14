import LegalPage from "@components/legal/LegalPage";
import { readToc } from "@components/legal/readToc";
import { metaFor } from "@seo/pages";
import Content from "./content.mdx";

export const metadata = metaFor("/legal/restricted-businesses");

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
