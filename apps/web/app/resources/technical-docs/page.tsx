"use client";

import Footer from "../../../components/Footer";
import Header from "../../../components/Header";
import TechnicalDocsContent from "./TechnicalDocsContent";

export default function TechnicalDocsPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <TechnicalDocsContent />
      <Footer />
    </div>
  );
}
