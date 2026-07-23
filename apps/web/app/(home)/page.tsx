import Footer from "@components/Footer";
import Header from "@components/Header";
import JsonLd from "@components/JsonLd";
import { homeSchema } from "@seo/structuredData";
import CodeSamplesSection from "./_components/CodeSamplesSection";
import DocsCalloutSection from "./_components/DocsCalloutSection";
import FaqSection from "./_components/FaqSection";
import FinalCtaSection from "./_components/FinalCtaSection";
import HeroSection from "./_components/HeroSection";
import PartnersSection from "./_components/PartnersSection";
import ScrollToTopButton from "./_components/ScrollToTopButton";
import UseCasesSection from "./_components/UseCasesSection";
import WhatYoureMissingSection from "./_components/WhatYoureMissingSection";

export default function Home() {
  return (
    <div className="min-h-screen">
      <JsonLd data={homeSchema()} />
      <Header />
      <HeroSection />
      <WhatYoureMissingSection />
      <DocsCalloutSection />
      <UseCasesSection />
      <PartnersSection />
      <CodeSamplesSection />
      <FaqSection />
      <FinalCtaSection />
      <Footer />
      <ScrollToTopButton />
    </div>
  );
}
