import Footer from "@components/Footer";
import Header from "@components/Header";
import JsonLd from "@components/JsonLd";
import { homeSchema } from "@seo/structuredData";
import AgenticPaymentsSection from "./_components/AgenticPaymentsSection";
import CodeSamplesSection from "./_components/CodeSamplesSection";
import FaqSection from "./_components/FaqSection";
import FinalCtaSection from "./_components/FinalCtaSection";
import HeroSection from "./_components/HeroSection";
import HowItWorksSection from "./_components/HowItWorksSection";
import PartnersSection from "./_components/PartnersSection";
import ScrollToTopButton from "./_components/ScrollToTopButton";
import UseCasesSection from "./_components/UseCasesSection";

export default function Home() {
  return (
    <div className="min-h-screen">
      <JsonLd data={homeSchema()} />
      <Header />
      <HeroSection />
      <AgenticPaymentsSection />
      <HowItWorksSection />
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
