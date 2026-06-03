"use client";

import Footer from "../../../components/Footer";
import Header from "../../../components/Header";
import BlogContent from "./BlogContent";

export default function BlogPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <BlogContent />
      <Footer />
    </div>
  );
}
