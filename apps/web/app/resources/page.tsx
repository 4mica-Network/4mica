"use client";

import Footer from "../../components/Footer";
import Header from "../../components/Header";
import ResourcesSection from "../../components/ResourcesSection";

export default function ResourcesPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-16">
        <ResourcesSection />
      </div>
      <Footer />
    </div>
  );
}
