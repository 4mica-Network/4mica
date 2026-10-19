import Footer from "@components/Footer";
import Header from "@components/Header";
import JsonLd from "@components/JsonLd";
import { homeSchema } from "@seo/structuredData";
import AgenticPaymentsSection from "./_components/AgenticPaymentsSection";
import BlogSection from "./_components/BlogSection";
import FaqSection from "./_components/FaqSection";
import HeroSection from "./_components/HeroSection";
import HowItWorksSection from "./_components/HowItWorksSection";
import PartnersSection from "./_components/PartnersSection";
import ScrollToTopButton from "./_components/ScrollToTopButton";
import TeamsSection from "./_components/TeamsSection";

export default function Home() {
  return (
    <div className="min-h-screen">
      <JsonLd data={homeSchema()} />
      <Header />
      <HeroSection />
      <AgenticPaymentsSection />
      <HowItWorksSection />
      <PartnersSection />
      <TeamsSection />
      <BlogSection />
      <FaqSection />
      <Footer />
      <ScrollToTopButton />
    </div>
  );
}
