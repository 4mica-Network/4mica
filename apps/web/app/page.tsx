"use client";

import CodeSamplesSection from "../components/CodeSamplesSection";
import DocsCalloutSection from "../components/DocsCalloutSection";
import FaqSection from "../components/FaqSection";
import FinalCtaSection from "../components/FinalCtaSection";
import Footer from "../components/Footer";
import Header from "../components/Header";
import HeroSection from "../components/HeroSection";
import PartnersSection from "../components/PartnersSection";
import UseCasesSection from "../components/UseCasesSection";
import WhatYoureMissingSection from "../components/WhatYoureMissingSection";

export default function Home() {
  return (
    <div className="min-h-screen">
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
    </div>
  );
}
