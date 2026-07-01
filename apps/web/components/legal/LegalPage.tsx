import Footer from "@components/Footer";
import Header from "@components/Header";
import TableOfContent, { type TocItem } from "@components/TableOfContent";
import type { ReactNode } from "react";
import { messages } from "@/i18n";

type LegalPageProps = {
  kicker?: string;
  title: string;
  lastUpdated: string;
  toc: TocItem[];
  children: ReactNode;
};

export default function LegalPage({
  kicker = messages.legal.defaultKicker,
  title,
  lastUpdated,
  toc,
  children,
}: LegalPageProps) {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-36 pb-20">
        <header className="mx-auto max-w-3xl text-center">
          <p className="section-kicker">{kicker}</p>
          <h1 className="section-title font-normal">{title}</h1>
          <p className="mt-3 text-ink-muted text-md">
            {messages.legal.lastUpdated} {lastUpdated}
          </p>
        </header>

        <div className="mx-auto mt-16 flex max-w-5xl gap-12">
          <TableOfContent toc={toc} />
          <article className="min-w-0 flex-1">{children}</article>
        </div>
      </div>
      <Footer />
    </div>
  );
}
