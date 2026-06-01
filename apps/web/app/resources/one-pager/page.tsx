"use client";

import Footer from "../../../components/Footer";
import Header from "../../../components/Header";
import OnePagerContent from "./OnePagerContent";

export default function OnePagerPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <OnePagerContent />
      <Footer />
    </div>
  );
}
