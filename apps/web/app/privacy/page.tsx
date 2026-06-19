import LegalPage from "@components/legal/LegalPage";
import { readToc } from "@components/legal/readToc";
import Content from "./content.mdx";

export default function PrivacyPage() {
  const toc = readToc("app/privacy/content.mdx");

  return (
    <LegalPage title="Privacy Policy" lastUpdated="June 2026" toc={toc}>
      <Content />
    </LegalPage>
  );
}
