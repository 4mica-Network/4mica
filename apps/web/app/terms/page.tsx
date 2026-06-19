import LegalPage from "@components/legal/LegalPage";
import { readToc } from "@components/legal/readToc";
import Content from "./content.mdx";

export default function TermsPage() {
  const toc = readToc("app/terms/content.mdx");

  return (
    <LegalPage title="Terms of Service" lastUpdated="June 2026" toc={toc}>
      <Content />
    </LegalPage>
  );
}
