import LegalPage from "@components/legal/LegalPage";
import { readToc } from "@components/legal/readToc";
import { metaFor } from "@seo/pages";
import Content from "./content.mdx";

export const metadata = metaFor("/dpa");

export default function DpaPage() {
  const toc = readToc("app/(site)/dpa/content.mdx");

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
